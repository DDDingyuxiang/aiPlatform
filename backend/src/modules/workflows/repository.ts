import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise'
import {
  approvalAiSummarySchema,
  type ApprovalItem,
  type ApprovalStatus,
  type ApprovalStepStatus,
  type CreateApprovalPayload,
  type DecisionPayload,
} from '@aiplatform/contracts'
import { ulid } from 'ulid'
import type { AuthContext } from '../identity/index.js'
import type { WorkflowNodeRecord, WorkflowRepository } from './types.js'

interface IdRow extends RowDataPacket {
  id: string
}

interface DefinitionRow extends RowDataPacket {
  id: string
}

interface NodeRow extends RowDataPacket {
  id: string
  node_key: string
  node_name: string
  sequence_no: number
  approver_type: string
  approver_ref_id: string | null
  approval_mode: string
}

interface ApproverRow extends RowDataPacket {
  id: string
  public_id: string
  display_name: string
}

interface ApprovalRow extends RowDataPacket {
  id: string
  public_id: string
  approval_type: string
  title: string
  applicant_public_id: string
  applicant_name: string
  applicant_department: string | null
  amount_cent: string | number | null
  submitted_at: Date | string
  status: string
  urgent: number | boolean
  ai_summary_json: unknown
}

interface FieldRow extends RowDataPacket {
  approval_instance_id: string
  field_key: string
  field_label: string
  field_value: string | null
}

interface StepRow extends RowDataPacket {
  approval_instance_id: string
  id: string
  node_name: string
  sequence_no: number
  approver_public_id: string | null
  approver_name: string | null
  status: string
  comment: string | null
  acted_at: Date | string | null
  instance_public_id: string
}

interface InstanceForDecisionRow extends RowDataPacket {
  id: string
  workflow_definition_id: string
  status: string
  current_step_sequence_no: number | null
}

interface DecisionNodeRow extends RowDataPacket {
  approval_mode: string
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function isoOrNull(value: Date | string | null): string | null {
  return value === null ? null : iso(value)
}

function safeAiSummary(value: unknown): ApprovalItem['aiSummary'] {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return { highlights: [] }
    }
  }
  const parsed = approvalAiSummarySchema.safeParse(value)
  return parsed.success ? parsed.data : { highlights: [] }
}

function stepPublicId(row: StepRow): string {
  return `${row.instance_public_id}.${row.sequence_no}.${row.approver_public_id ?? 'system'}`
}

async function loadItems(
  executor: Pool | PoolConnection,
  tenantId: string,
  ids: string[],
): Promise<ApprovalItem[]> {
  if (ids.length === 0) return []
  const slots = ids.map(() => '?').join(', ')
  const [approvalRows] = await executor.execute<ApprovalRow[]>(
    `SELECT a.id,
            a.public_id,
            a.approval_type,
            a.title,
            applicant.public_id AS applicant_public_id,
            applicant.display_name AS applicant_name,
            department.name AS applicant_department,
            a.amount_cent,
            a.submitted_at,
            a.status,
            a.urgent,
            a.ai_summary_json
       FROM approval_instances a
       JOIN employees applicant
         ON applicant.tenant_id = a.tenant_id
        AND applicant.id = a.applicant_employee_id
       LEFT JOIN departments department
         ON department.tenant_id = a.tenant_id
        AND department.id = a.applicant_department_id
      WHERE a.tenant_id = ?
        AND a.id IN (${slots})
        AND a.deleted_at IS NULL`,
    [tenantId, ...ids],
  )
  if (approvalRows.length === 0) return []
  const instanceIds = approvalRows.map((row) => row.id)
  const instanceSlots = instanceIds.map(() => '?').join(', ')
  const [fieldRows] = await executor.execute<FieldRow[]>(
    `SELECT approval_instance_id, field_key, field_label, field_value
       FROM approval_fields
      WHERE tenant_id = ?
        AND approval_instance_id IN (${instanceSlots})
      ORDER BY sort_order ASC, id ASC`,
    [tenantId, ...instanceIds],
  )
  const [stepRows] = await executor.execute<StepRow[]>(
    `SELECT s.approval_instance_id,
            s.id,
            s.node_name,
            s.sequence_no,
            approver.public_id AS approver_public_id,
            approver.display_name AS approver_name,
            s.status,
            s.comment,
            s.acted_at,
            a.public_id AS instance_public_id
       FROM approval_instance_steps s
       JOIN approval_instances a
         ON a.tenant_id = s.tenant_id
        AND a.id = s.approval_instance_id
       LEFT JOIN employees approver
         ON approver.tenant_id = s.tenant_id
        AND approver.id = s.approver_employee_id
      WHERE s.tenant_id = ?
        AND s.approval_instance_id IN (${instanceSlots})
      ORDER BY s.approval_instance_id ASC, s.sequence_no ASC, s.id ASC`,
    [tenantId, ...instanceIds],
  )

  const fieldsByInstance = new Map<string, ApprovalItem['fields']>()
  for (const row of fieldRows) {
    const fields = fieldsByInstance.get(row.approval_instance_id) ?? []
    fields.push({ key: row.field_key, label: row.field_label, value: row.field_value ?? '' })
    fieldsByInstance.set(row.approval_instance_id, fields)
  }
  const stepsByInstance = new Map<string, ApprovalItem['steps']>()
  for (const row of stepRows) {
    const steps = stepsByInstance.get(row.approval_instance_id) ?? []
    steps.push({
      id: stepPublicId(row),
      nodeName: row.node_name,
      approver:
        row.approver_public_id && row.approver_name
          ? { id: row.approver_public_id, name: row.approver_name }
          : null,
      status: row.status as ApprovalStepStatus,
      comment: row.comment,
      actedAt: isoOrNull(row.acted_at),
    })
    stepsByInstance.set(row.approval_instance_id, steps)
  }

  return approvalRows.map((row) => {
    const steps = stepsByInstance.get(row.id) ?? []
    const activeStep = steps.find((step) => step.status === 'active')
    return {
      id: row.public_id,
      type: row.approval_type as ApprovalItem['type'],
      title: row.title,
      applicant: {
        id: row.applicant_public_id,
        name: row.applicant_name,
        department: row.applicant_department ?? '',
      },
      ...(row.amount_cent === null ? {} : { amountCent: Number(row.amount_cent) }),
      submittedAt: iso(row.submitted_at),
      status: row.status as ApprovalStatus,
      urgent: Boolean(row.urgent),
      fields: fieldsByInstance.get(row.id) ?? [],
      attachments: [],
      steps,
      currentApproverId: activeStep?.approver?.id ?? null,
      aiSummary: safeAiSummary(row.ai_summary_json),
    }
  })
}

async function resolveNodeApprovers(
  executor: Pool | PoolConnection,
  tenantId: string,
  applicantEmployeeId: string,
  departmentId: string | null,
  node: WorkflowNodeRecord,
): Promise<ApproverRow[]> {
  if (node.approverType === 'employee') {
    if (!node.approverRefId) return []
    const [rows] = await executor.execute<ApproverRow[]>(
      `SELECT id, public_id, display_name
         FROM employees
        WHERE tenant_id = ? AND id = ? AND status = 'active' AND deleted_at IS NULL
          AND id <> ?`,
      [tenantId, node.approverRefId, applicantEmployeeId],
    )
    return rows
  }

  if (node.approverType === 'role' && node.approverRefId) {
    const [rows] = await executor.execute<ApproverRow[]>(
      `SELECT DISTINCT e.id, e.public_id, e.display_name
         FROM employee_roles er
         JOIN employees e
           ON e.tenant_id = er.tenant_id AND e.id = er.employee_id
         JOIN roles r
           ON r.tenant_id = er.tenant_id AND r.id = er.role_id
        WHERE er.tenant_id = ? AND er.role_id = ?
          AND e.status = 'active' AND e.deleted_at IS NULL
          AND r.deleted_at IS NULL AND e.id <> ?
        ORDER BY e.id ASC`,
      [tenantId, node.approverRefId, applicantEmployeeId],
    )
    return rows
  }

  if (node.approverType === 'department_manager') {
    if (!departmentId) return []
    const [rows] = await executor.execute<ApproverRow[]>(
      `SELECT DISTINCT e.id, e.public_id, e.display_name
         FROM employee_department_memberships edm
         JOIN employees e
           ON e.tenant_id = edm.tenant_id AND e.id = edm.employee_id
         JOIN employee_roles er
           ON er.tenant_id = e.tenant_id AND er.employee_id = e.id
         JOIN roles r
           ON r.tenant_id = er.tenant_id AND r.id = er.role_id
        WHERE edm.tenant_id = ? AND edm.department_id = ? AND edm.is_primary = 1
          AND e.status = 'active' AND e.deleted_at IS NULL
          AND r.code = 'admin' AND r.deleted_at IS NULL AND e.id <> ?
        ORDER BY e.id ASC`,
      [tenantId, departmentId, applicantEmployeeId],
    )
    return rows
  }
  return []
}

export function createMySqlWorkflowRepository(pool: Pool): WorkflowRepository {
  return {
    async listRelated(tenantId, employeeId) {
      const [rows] = await pool.execute<IdRow[]>(
        `SELECT a.id
           FROM approval_instances a
          WHERE a.tenant_id = ?
            AND a.deleted_at IS NULL
            AND (
              a.applicant_employee_id = ?
              OR EXISTS (
                SELECT 1 FROM approval_instance_steps s
                 WHERE s.tenant_id = a.tenant_id
                   AND s.approval_instance_id = a.id
                   AND s.approver_employee_id = ?
              )
            )
          ORDER BY a.submitted_at DESC, a.id DESC
          LIMIT 500`,
        [tenantId, employeeId, employeeId],
      )
      const items = await loadItems(pool, tenantId, rows.map((row) => row.id))
      const order = new Map(rows.map((row, index) => [row.id, index]))
      return items.sort((left, right) =>
        (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
      )
    },

    async create(auth, payload: CreateApprovalPayload) {
      const connection = await pool.getConnection()
      let approvalId: string | null = null
      try {
        await connection.beginTransaction()
        const [employeeRows] = await connection.execute<
          Array<RowDataPacket & { id: string; department_id: string | null }>
        >(
          `SELECT e.id,
                  (SELECT edm.department_id
                     FROM employee_department_memberships edm
                    WHERE edm.tenant_id = e.tenant_id
                      AND edm.employee_id = e.id
                      AND edm.is_primary = 1
                    LIMIT 1) AS department_id
             FROM employees e
            WHERE e.tenant_id = ? AND e.id = ?
              AND e.status = 'active' AND e.deleted_at IS NULL
            LIMIT 1`,
          [auth.tenantId, auth.employeeId],
        )
        const applicant = employeeRows.at(0)
        if (!applicant) throw new Error('申请人账号不可用')

        const [definitionRows] = await connection.execute<DefinitionRow[]>(
          `SELECT id FROM workflow_definitions
            WHERE tenant_id = ? AND approval_type = ?
              AND status = 'active' AND deleted_at IS NULL
            ORDER BY version DESC, id DESC LIMIT 1`,
          [auth.tenantId, payload.type],
        )
        const definition = definitionRows.at(0)
        if (!definition) throw new Error(`企业尚未配置${payload.type}审批流程`)

        const [nodeRows] = await connection.execute<NodeRow[]>(
          `SELECT id, node_key, node_name, sequence_no,
                  approver_type, approver_ref_id, approval_mode
             FROM workflow_definition_nodes
            WHERE tenant_id = ? AND workflow_definition_id = ?
            ORDER BY sequence_no ASC, id ASC`,
          [auth.tenantId, definition.id],
        )
        if (nodeRows.length === 0) throw new Error('审批流程没有配置审批节点')

        const nodes: WorkflowNodeRecord[] = nodeRows.map((row) => ({
          id: row.id,
          nodeKey: row.node_key,
          nodeName: row.node_name,
          sequenceNo: Number(row.sequence_no),
          approverType: row.approver_type as WorkflowNodeRecord['approverType'],
          approverRefId: row.approver_ref_id,
          approvalMode: row.approval_mode as WorkflowNodeRecord['approvalMode'],
        }))
        const resolvedNodes = await Promise.all(
          nodes.map(async (node) => ({
            node,
            approvers: await resolveNodeApprovers(
              connection,
              auth.tenantId,
              auth.employeeId,
              applicant.department_id,
              node,
            ),
          })),
        )
        if (resolvedNodes.some(({ approvers }) => approvers.length === 0)) {
          throw new Error('审批流程中存在没有有效审批人的节点')
        }

        const firstNode = resolvedNodes[0]!
        const publicId = ulid()
        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO approval_instances
             (tenant_id, public_id, workflow_definition_id, approval_type, title,
              applicant_employee_id, applicant_department_id, amount_cent, urgent,
              status, current_step_sequence_no, ai_summary_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, JSON_OBJECT('highlights', JSON_ARRAY()))`,
          [
            auth.tenantId,
            publicId,
            definition.id,
            payload.type,
            payload.title,
            auth.employeeId,
            applicant.department_id,
            payload.amountCent ?? null,
            payload.urgent ?? false,
            firstNode.node.sequenceNo,
          ],
        )
        approvalId = String(insert.insertId)

        await connection.execute(
          `INSERT INTO approval_instance_steps
             (tenant_id, approval_instance_id, workflow_definition_node_id,
              node_key, node_name, sequence_no, approver_employee_id, status,
              action, acted_at)
           VALUES (?, ?, NULL, NULL, '提交申请', 0, ?, 'done', 'submit', UTC_TIMESTAMP(3))`,
          [auth.tenantId, approvalId, auth.employeeId],
        )

        for (const { node, approvers } of resolvedNodes) {
          const placeholders = approvers.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
          const values = approvers.flatMap((approver, index) => [
            auth.tenantId,
            approvalId,
            node.id,
            node.nodeKey,
            node.nodeName,
            node.sequenceNo,
            approver.id,
            node.sequenceNo === firstNode.node.sequenceNo && index === 0
              ? 'active'
              : 'waiting',
          ])
          await connection.execute(
            `INSERT INTO approval_instance_steps
               (tenant_id, approval_instance_id, workflow_definition_node_id,
                node_key, node_name, sequence_no, approver_employee_id, status)
             VALUES ${placeholders}`,
            values,
          )
        }

        if (payload.fields.length > 0) {
          const placeholders = payload.fields.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')
          const values = payload.fields.flatMap((field, index) => [
            auth.tenantId,
            approvalId,
            field.key,
            field.label,
            field.value,
            index,
          ])
          await connection.execute(
            `INSERT INTO approval_fields
               (tenant_id, approval_instance_id, field_key, field_label, field_value, sort_order)
             VALUES ${placeholders}`,
            values,
          )
        }
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        if (error instanceof Error && /尚未配置|没有配置|没有有效审批人/.test(error.message)) {
          const conflict = new Error(error.message)
          conflict.name = 'WorkflowConfigurationError'
          throw conflict
        }
        throw error
      } finally {
        connection.release()
      }
      const item = await loadItems(pool, auth.tenantId, approvalId ? [approvalId] : [])
      if (!item[0]) throw new Error('审批单创建后读取失败')
      return item[0]
    },

    async decide(auth, publicId, payload: DecisionPayload) {
      const connection = await pool.getConnection()
      let approvalId: string | null = null
      try {
        await connection.beginTransaction()
        const [rows] = await connection.execute<InstanceForDecisionRow[]>(
          `SELECT id, workflow_definition_id, status, current_step_sequence_no
             FROM approval_instances
            WHERE tenant_id = ? AND public_id = ? AND deleted_at IS NULL
            FOR UPDATE`,
          [auth.tenantId, publicId],
        )
        const approval = rows.at(0)
        if (!approval) throw new Error('审批单不存在')
        if (approval.status !== 'pending' || approval.current_step_sequence_no === null) {
          throw new Error('该审批单已处理完成')
        }
        approvalId = approval.id
        const sequenceNo = Number(approval.current_step_sequence_no)
        const [activeRows] = await connection.execute<
          Array<RowDataPacket & { id: string }>
        >(
          `SELECT id FROM approval_instance_steps
            WHERE tenant_id = ? AND approval_instance_id = ?
              AND sequence_no = ? AND approver_employee_id = ? AND status = 'active'
            FOR UPDATE`,
          [auth.tenantId, approvalId, sequenceNo, auth.employeeId],
        )
        const active = activeRows.at(0)
        if (!active) throw new Error('该事项当前不在你的待办中')

        if (payload.action === 'reject') {
          await connection.execute(
            `UPDATE approval_instance_steps
                SET status = IF(id = ?, 'rejected', 'skipped'),
                    action = IF(id = ?, 'reject', action),
                    comment = IF(id = ?, ?, comment),
                    acted_at = IF(id = ?, UTC_TIMESTAMP(3), acted_at),
                    updated_at = UTC_TIMESTAMP(3)
              WHERE tenant_id = ? AND approval_instance_id = ?
                AND sequence_no >= ? AND status IN ('active', 'waiting')`,
            [
              active.id,
              active.id,
              active.id,
              payload.comment,
              active.id,
              auth.tenantId,
              approvalId,
              sequenceNo,
            ],
          )
          await connection.execute(
            `UPDATE approval_instances
                SET status = 'rejected', current_step_sequence_no = NULL,
                    finished_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
              WHERE tenant_id = ? AND id = ?`,
            [auth.tenantId, approvalId],
          )
        } else {
          await connection.execute(
            `UPDATE approval_instance_steps
                SET status = 'done', action = 'approve', comment = ?,
                    acted_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
              WHERE tenant_id = ? AND id = ?`,
            [payload.comment || null, auth.tenantId, active.id],
          )
          const [nodeRows] = await connection.execute<DecisionNodeRow[]>(
            `SELECT approval_mode FROM workflow_definition_nodes
              WHERE tenant_id = ? AND workflow_definition_id = ? AND sequence_no = ?
              LIMIT 1`,
            [auth.tenantId, approval.workflow_definition_id, sequenceNo],
          )
          const mode = nodeRows.at(0)?.approval_mode ?? 'any'
          const [waitingRows] = await connection.execute<
            Array<RowDataPacket & { id: string }>
          >(
            `SELECT id FROM approval_instance_steps
              WHERE tenant_id = ? AND approval_instance_id = ?
                AND sequence_no = ? AND status = 'waiting'
              ORDER BY id ASC FOR UPDATE`,
            [auth.tenantId, approvalId, sequenceNo],
          )
          let nodeDone = waitingRows.length === 0
          if (mode === 'any' && waitingRows.length > 0) {
            await connection.execute(
              `UPDATE approval_instance_steps SET status = 'skipped', updated_at = UTC_TIMESTAMP(3)
                WHERE tenant_id = ? AND approval_instance_id = ?
                  AND sequence_no = ? AND status = 'waiting'`,
              [auth.tenantId, approvalId, sequenceNo],
            )
            nodeDone = true
          } else if (mode === 'all' && waitingRows.length > 0) {
            const nextApprover = waitingRows[0]!
            await connection.execute(
              `UPDATE approval_instance_steps SET status = 'active', updated_at = UTC_TIMESTAMP(3)
                WHERE tenant_id = ? AND id = ?`,
              [auth.tenantId, nextApprover.id],
            )
          }

          if (nodeDone) {
            const [nextRows] = await connection.execute<
              Array<RowDataPacket & { sequence_no: number }>
            >(
              `SELECT MIN(sequence_no) AS sequence_no
                 FROM approval_instance_steps
                WHERE tenant_id = ? AND approval_instance_id = ?
                  AND sequence_no > ? AND status = 'waiting'`,
              [auth.tenantId, approvalId, sequenceNo],
            )
            const nextSequence = nextRows.at(0)?.sequence_no
            if (nextSequence === null || nextSequence === undefined) {
              await connection.execute(
                `UPDATE approval_instances
                    SET status = 'approved', current_step_sequence_no = NULL,
                        finished_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
                  WHERE tenant_id = ? AND id = ?`,
                [auth.tenantId, approvalId],
              )
            } else {
              await connection.execute(
                `UPDATE approval_instance_steps
                    SET status = 'active', updated_at = UTC_TIMESTAMP(3)
                  WHERE tenant_id = ? AND approval_instance_id = ?
                    AND sequence_no = ? AND status = 'waiting'
                  ORDER BY id ASC LIMIT 1`,
                [auth.tenantId, approvalId, nextSequence],
              )
              await connection.execute(
                `UPDATE approval_instances
                    SET current_step_sequence_no = ?, updated_at = UTC_TIMESTAMP(3)
                  WHERE tenant_id = ? AND id = ?`,
                [nextSequence, auth.tenantId, approvalId],
              )
            }
          }
        }
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        if (error instanceof Error && /不存在|已处理完成|不在你的待办/.test(error.message)) {
          const notFound = new Error(error.message)
          notFound.name = error.message === '审批单不存在' ? 'ApprovalNotFoundError' : 'ApprovalConflictError'
          throw notFound
        }
        throw error
      } finally {
        connection.release()
      }
      const items = await loadItems(pool, auth.tenantId, approvalId ? [approvalId] : [])
      if (!items[0]) throw new Error('审批处理后读取失败')
      return items[0]
    },
  }
}
