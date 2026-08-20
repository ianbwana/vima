import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml');

/**
 * Structural integration tests for Docker environment.
 *
 * These tests validate that the Docker infrastructure is correctly
 * configured without needing to actually run Docker. They verify:
 * - docker-compose.yml service definitions and health checks
 * - Dockerfile multi-stage build structure
 * - Entrypoint script migration-before-start ordering
 * - Health endpoint contract
 * - Environment variable documentation
 *
 * Validates: Requirements 14.2, 14.6, 15.1
 */

const ROOT_DIR = path.resolve(__dirname, '../../..');

describe('Docker Environment Integration', () => {
  describe('docker-compose.yml is valid and correctly configured', () => {
    let compose: any;

    beforeAll(() => {
      const composePath = path.join(ROOT_DIR, 'docker-compose.yml');
      const content = fs.readFileSync(composePath, 'utf-8');
      compose = yaml.load(content);
    });

    it('defines postgres, redis, and api services', () => {
      expect(compose.services).toBeDefined();
      expect(compose.services.postgres).toBeDefined();
      expect(compose.services.redis).toBeDefined();
      expect(compose.services.api).toBeDefined();
    });

    it('postgres has a health check with pg_isready', () => {
      const pg = compose.services.postgres;
      expect(pg.healthcheck).toBeDefined();
      const testCmd = Array.isArray(pg.healthcheck.test)
        ? pg.healthcheck.test.join(' ')
        : pg.healthcheck.test;
      expect(testCmd).toContain('pg_isready');
    });

    it('redis has a health check with redis-cli ping', () => {
      const redis = compose.services.redis;
      expect(redis.healthcheck).toBeDefined();
      const testCmd = Array.isArray(redis.healthcheck.test)
        ? redis.healthcheck.test.join(' ')
        : redis.healthcheck.test;
      expect(testCmd).toContain('redis-cli');
      expect(testCmd).toContain('ping');
    });

    it('api depends_on postgres and redis with condition: service_healthy', () => {
      const api = compose.services.api;
      expect(api.depends_on).toBeDefined();
      expect(api.depends_on.postgres).toEqual(
        expect.objectContaining({ condition: 'service_healthy' }),
      );
      expect(api.depends_on.redis).toEqual(
        expect.objectContaining({ condition: 'service_healthy' }),
      );
    });

    it('api exposes port 3000', () => {
      const api = compose.services.api;
      expect(api.ports).toBeDefined();
      const portMappings = api.ports.map((p: string | number) => String(p));
      const exposesPort3000 = portMappings.some(
        (p: string) => p.includes('3000'),
      );
      expect(exposesPort3000).toBe(true);
    });

    it('api health check uses /health endpoint with start_period', () => {
      const api = compose.services.api;
      expect(api.healthcheck).toBeDefined();
      const testCmd = Array.isArray(api.healthcheck.test)
        ? api.healthcheck.test.join(' ')
        : api.healthcheck.test;
      expect(testCmd).toContain('/health');
      expect(api.healthcheck.start_period).toBeDefined();
    });
  });

  describe('Dockerfile is multi-stage', () => {
    let dockerfileContent: string;

    beforeAll(() => {
      const dockerfilePath = path.join(ROOT_DIR, 'docker/Dockerfile');
      dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');
    });

    it('contains at least 3 FROM stages (deps, builder, runner)', () => {
      const fromStatements = dockerfileContent.match(/^FROM\s+/gm) || [];
      expect(fromStatements.length).toBeGreaterThanOrEqual(3);
    });

    it('has named stages for deps, builder, and runner', () => {
      expect(dockerfileContent).toMatch(/FROM\s+\S+\s+AS\s+deps/i);
      expect(dockerfileContent).toMatch(/FROM\s+\S+\s+AS\s+builder/i);
      expect(dockerfileContent).toMatch(/FROM\s+\S+\s+AS\s+runner/i);
    });

    it('copies drizzle migrations directory into the production image', () => {
      // The runner stage should copy drizzle migrations
      const runnerSection = dockerfileContent.split(/FROM\s+\S+\s+AS\s+runner/i)[1];
      expect(runnerSection).toBeDefined();
      expect(runnerSection).toMatch(/COPY.*drizzle/);
    });

    it('references the entrypoint script', () => {
      expect(dockerfileContent).toMatch(/entrypoint\.sh/);
      expect(dockerfileContent).toMatch(/ENTRYPOINT/);
    });

    it('uses node:20-alpine as base image', () => {
      expect(dockerfileContent).toMatch(/node:20-alpine/);
    });

    it('exposes port 3000', () => {
      expect(dockerfileContent).toMatch(/EXPOSE\s+3000/);
    });
  });

  describe('Entrypoint script runs migrations before starting', () => {
    let entrypointContent: string;

    beforeAll(() => {
      const entrypointPath = path.join(
        ROOT_DIR,
        'docker/scripts/entrypoint.sh',
      );
      entrypointContent = fs.readFileSync(entrypointPath, 'utf-8');
    });

    it('calls drizzle-kit migrate before the main process', () => {
      const migrateIndex = entrypointContent.indexOf('drizzle-kit migrate');
      const startIndex = entrypointContent.indexOf('node');
      expect(migrateIndex).toBeGreaterThan(-1);
      expect(startIndex).toBeGreaterThan(-1);
      expect(migrateIndex).toBeLessThan(startIndex);
    });

    it('starts the node application after migrations', () => {
      expect(entrypointContent).toMatch(/node\s+.*main/);
    });

    it('uses set -e for fail-fast behavior', () => {
      expect(entrypointContent).toContain('set -e');
    });
  });

  describe('Health endpoint contract', () => {
    let healthControllerContent: string;

    beforeAll(() => {
      const healthControllerPath = path.join(
        ROOT_DIR,
        'apps/api/src/health.controller.ts',
      );
      healthControllerContent = fs.readFileSync(healthControllerPath, 'utf-8');
    });

    it('has a GET /health endpoint', () => {
      expect(healthControllerContent).toMatch(/@Controller\(['"]health['"]\)/);
      expect(healthControllerContent).toMatch(/@Get\(\)/);
    });

    it('checks Postgres connectivity', () => {
      expect(healthControllerContent).toMatch(/checkPostgres|postgres/i);
    });

    it('checks Redis connectivity', () => {
      expect(healthControllerContent).toMatch(/checkRedis|redis/i);
    });

    it('returns HTTP 503 when dependencies are unhealthy', () => {
      expect(healthControllerContent).toMatch(
        /SERVICE_UNAVAILABLE|503/,
      );
    });

    it('returns status ok when all dependencies are reachable', () => {
      expect(healthControllerContent).toMatch(/['"]ok['"]/);
    });
  });

  describe('Environment variables documented', () => {
    let rootEnvExample: string;
    let apiEnvExample: string;

    beforeAll(() => {
      const rootEnvPath = path.join(ROOT_DIR, '.env.example');
      rootEnvExample = fs.readFileSync(rootEnvPath, 'utf-8');

      const apiEnvPath = path.join(ROOT_DIR, 'apps/api/.env.example');
      apiEnvExample = fs.readFileSync(apiEnvPath, 'utf-8');
    });

    it('root .env.example contains POSTGRES_PASSWORD', () => {
      expect(rootEnvExample).toContain('POSTGRES_PASSWORD');
    });

    it('root .env.example contains JWT_SECRET', () => {
      expect(rootEnvExample).toContain('JWT_SECRET');
    });

    it('api .env.example contains DATABASE_URL or CONTROL_PLANE_DATABASE_URL', () => {
      const hasDatabaseUrl =
        apiEnvExample.includes('DATABASE_URL') ||
        apiEnvExample.includes('CONTROL_PLANE_DATABASE_URL');
      expect(hasDatabaseUrl).toBe(true);
    });

    it('api .env.example contains REDIS_URL', () => {
      expect(apiEnvExample).toContain('REDIS_URL');
    });

    it('api .env.example contains PORT', () => {
      expect(apiEnvExample).toContain('PORT');
    });

    it('api .env.example contains JWT_SECRET', () => {
      expect(apiEnvExample).toContain('JWT_SECRET');
    });
  });
});
