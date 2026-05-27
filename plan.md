1. **Understand the Testing Gap**: The `WsObjectUnlockSchema` from `lib/api/wsSchemas.ts` does not have any corresponding tests in `lib/api/wsSchemas.test.ts`. Wait, let me check if `WsObjectLockSchema` has tests as well. It looks like both might be missing. I should add tests for both `WsObjectLockSchema` and `WsObjectUnlockSchema`.
2. **Modify `lib/api/wsSchemas.test.ts`**: Add a new `describe` block for `WsObjectLockSchema / WsObjectUnlockSchema`.
3. **Run tests**: Run the unit test suite (`npm run test` or `vitest run`) to verify the newly added tests pass.
4. **Pre-commit**: Complete the pre-commit instructions before submitting.
