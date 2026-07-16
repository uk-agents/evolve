import { defineHook } from "eve/hooks";

export default defineHook({
  events: {
    async "turn.started"(_event, ctx) {
      console.log(
        `[evolve:turn] turn started session=${ctx.session.id}`
      );
    },

    async "turn.failed"(event, ctx) {
      const { code, message, turnId } = event.data;
      console.log(
        `[evolve:turn] turn failed session=${ctx.session.id} turnId=${turnId} code=${code} message="${message}"`
      );
    },

    async "step.failed"(event, ctx) {
      const { code, message, turnId, stepIndex } = event.data;
      console.log(
        `[evolve:turn] step failed session=${ctx.session.id} turnId=${turnId} stepIndex=${stepIndex} code=${code} message="${message}"`
      );
    },
  },
});
