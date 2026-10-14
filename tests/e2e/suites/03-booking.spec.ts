import { CREDENTIALS, ctx, E2E_TAG, expect, login, q, retry, suite } from "../setup";
import { assertIsTestMember } from "../../test-guard";

/**
 * 模块三：顾客预约旅程
 * 产出：ctx.memberId / ctx.serviceId / ctx.staffId / ctx.apptId（pending，供后续套件使用）
 */
export const bookingSpec = suite("顾客预约旅程", [
  {
    name: "GIVEN 会员已登录 WHEN 查询未来第 3 天可约时段 THEN 返回非空时段列表",
    run: async () => {
      const member = await login(CREDENTIALS.member.email, CREDENTIALS.member.password);
      ctx.member = member;

      const { data: me } = await retry(() => member.auth.getUser());
      const memberRow = await retry(() =>
        q(member.from("members").select("id, name, email, balance").eq("user_id", me.user!.id).single())
      );
      expect(!!memberRow, "读取会员档案失败");

      // 安全护栏：ctx.memberId 是后续所有破坏性操作（扣款、改余额、删单）的目标。
      // 在把它固定下来之前，必须证明它就是配置的测试账号 —— 万一
      // E2E_MEMBER_EMAIL 被错配成真实顾客，这里当场中止，而不是扣错人的钱。
      const testMember = assertIsTestMember(memberRow, "03-booking 建立测试会员上下文");
      ctx.memberId = testMember.id;
      // 记账基线：必须在任何预约产生之前记录。
      // 「预约即扣款」生效后，创建预约会先扣款、取消/删除再退回；
      // 若baseline取自扣款之后，清理阶段的退款会让余额高于基线而误报。
      ctx.originalBalance = testMember.balance;

      const svc = await retry(() =>
        q(member.from("services").select("id, name, duration").eq("name", "姜汤头疗").single())
      );
      ctx.serviceId = svc.id;
      ctx.serviceName = svc.name;

      const st = await retry(() =>
        q(member.from("staff").select("id, name").eq("name", "林小梓").single())
      );
      ctx.staffId = st.id;
      ctx.staffName = st.name;

      const target = new Date(Date.now() + 3 * 86400000);
      ctx.dateStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;

      const slots = await retry(() =>
        q(
          member.rpc("get_available_slots", {
            p_staff_id: ctx.staffId,
            p_service_id: ctx.serviceId,
            p_date: ctx.dateStr,
          })
        )
      );
      expect(Array.isArray(slots) && slots.length > 0, `获取时段失败，返回 ${slots?.length ?? "null"} 个`);
      expect(slots.length >= 10, `时段数异常偏少: ${slots.length}`);
      ctx.slots = slots.map((s: any) => s.slot_start);
    },
  },
  {
    name: "GIVEN 选中时段 WHEN create_appointment THEN 返回单号且数据库状态为 pending",
    run: async () => {
      const member = ctx.member;
      const aptId = await retry(() =>
        q(
          member.rpc("create_appointment", {
            p_customer_id: ctx.memberId,
            p_staff_id: ctx.staffId,
            p_service_id: ctx.serviceId,
            p_start_time: ctx.slots[0],
            p_remark: E2E_TAG,
          })
        )
      );
      expect(!!aptId, "预约未返回单号");
      ctx.apptId = aptId;

      // 用会员自己的客户端验证（RLS：会员可见本人预约；匿名不可见）
      const row = await retry(() =>
        q(
          ctx.member
            .from("appointments")
            .select("status, start_time, end_time, remark")
            .eq("id", ctx.apptId)
            .single()
        )
      );
      expect(row.status === "pending", `新预约状态应为 pending，实际 ${row.status}`);
      expect(row.remark === E2E_TAG, "备注未正确保存");
    },
  },
  {
    name: "GIVEN 同一时段已被占 WHEN 再次预约 THEN 被拒且提示已被预约",
    run: async () => {
      const member = ctx.member;
      const { error } = await member.rpc("create_appointment", {
        p_customer_id: ctx.memberId,
        p_staff_id: ctx.staffId,
        p_service_id: ctx.serviceId,
        p_start_time: ctx.slots[0],
      });
      expect(!!error, "重复预约竟未报错");
      expect(error!.message.includes("已被预约"), `拒绝原因异常: ${error!.message}`);
    },
  },
  {
    name: "GIVEN 会员视角 WHEN 查询预约列表 THEN 仅能看到本人单且包含新单（RLS 隔离）",
    run: async () => {
      const member = ctx.member;
      const rows = await retry(() => q(member.from("appointments").select("id, customer_id, status")));
      expect(rows.some((r: any) => r.id === ctx.apptId), "会员看不到自己的新预约");
      expect(
        rows.every((r: any) => r.customer_id === ctx.memberId),
        "RLS 失效：会员竟能看到他人的预约"
      );
    },
  },
  {
    name: "GIVEN 挂起单 WHEN 顾客自取消 THEN 状态变为 cancelled",
    run: async () => {
      const member = ctx.member;
      await retry(() => member.rpc("cancel_appointment", { p_appointment_id: ctx.apptId }));
      const row = await retry(() =>
        q(ctx.member.from("appointments").select("status").eq("id", ctx.apptId).single())
      );
      expect(row.status === "cancelled", `取消后状态应为 cancelled，实际 ${row.status}`);
    },
  },
  {
    name: "GIVEN 已取消释放时段 WHEN 重新预约新时段 THEN 成功且供后续确认流程使用",
    run: async () => {
      const member = ctx.member;
      const slot = ctx.slots[2];
      const aptId = await retry(() =>
        q(
          member.rpc("create_appointment", {
            p_customer_id: ctx.memberId,
            p_staff_id: ctx.staffId,
            p_service_id: ctx.serviceId,
            p_start_time: slot,
            p_remark: E2E_TAG,
          })
        )
      );
      expect(!!aptId, "重新预约失败");
      ctx.apptId = aptId;

      const row = await retry(() =>
        q(ctx.member.from("appointments").select("status").eq("id", ctx.apptId).single())
      );
      expect(row.status === "pending", "重新预约应为 pending");
    },
  },
]);
