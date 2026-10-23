import { defineConfig } from 'vitest/config';

// Testes das regras de negócio e da migração (não usa a configuração do app).
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
