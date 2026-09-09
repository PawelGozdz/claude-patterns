// WYGENEROWANE przez scripts/generate-pattern-routing.mjs — NIE edytuj ręcznie.
// Źródło: sekcje `pattern_routing:` w blocks/**.yml. Po zmianie reguły w bloku
// uruchom generator; `--check` wykrywa rozjazd (nadaje się do CI).
//
// Kolejność: od najbardziej do najmniej specyficznego dopasowania ("first match wins").

const PATH_RULES = [
  { match: "/infrastructure/repositories/mappers/", pattern: "infrastructure/mapper-pattern.md" }, // kysely
  { match: "/application/event-handlers/", pattern: "application/audit-handler-pattern.md" }, // ddd/cqrs
  { match: "/infrastructure/controllers/", pattern: "infrastructure/controller-schema-pattern.md" }, // zod
  { match: "/infrastructure/persistence/", pattern: "infrastructure/repository-pattern.md" }, // kysely
  { match: "/domain/specifications/", pattern: "domain/specification-policy-pattern.md" }, // ddd/core
  { match: "/application/commands/", pattern: "application/command-handler-pattern.md" }, // ddd/cqrs
  { match: "/application/services/", pattern: "application/application-service-pattern.md" }, // ddd/cqrs
  { match: "/domain/value-objects/", pattern: "domain/value-object-pattern.md" }, // ddd/core
  { match: "/application/queries/", pattern: "application/query-handler-pattern.md" }, // ddd/cqrs
  { match: "/domain/repositories/", pattern: "infrastructure/repository-pattern.md" }, // kysely
  { match: "/infrastructure/acl/", pattern: "architecture/acl-registry-pattern.md" }, // ddd/acl
  { match: "/domain/aggregates/", pattern: "domain/aggregate-pattern.md" }, // ddd/core
  { match: "/domain/entities/", pattern: "domain/entity-pattern.md" }, // ddd/core
  { match: "/domain/policies/", pattern: "domain/specification-policy-pattern.md" }, // ddd/core
  { match: "/domain/services/", pattern: "domain/domain-service-pattern.md" }, // ddd/core
  { match: "/domain/events/", pattern: "domain/domain-event-pattern.md" }, // ddd/core
];

const FILENAME_RULES = [
  { match: /\.specification\.ts$/, pattern: "domain/specification-policy-pattern.md" }, // ddd/core
  { match: /\.rate-limits\.ts$/, pattern: "infrastructure/rate-limit-guard-pattern.md" }, // zod
  { match: /\.controller\.ts$/, pattern: "infrastructure/controller-schema-pattern.md" }, // zod
  { match: /\.repository\.ts$/, pattern: "infrastructure/repository-pattern.md" }, // kysely
  { match: /\.aggregate\.ts$/, pattern: "domain/aggregate-pattern.md" }, // ddd/core
  { match: /\.scheduler\.ts$/, pattern: "infrastructure/repository-pattern.md" }, // kysely
  { match: /\.adapter\.ts$/, pattern: "architecture/acl-registry-pattern.md" }, // ddd/acl
  { match: /\.handler\.ts$/, pattern: "application/command-handler-pattern.md" }, // ddd/cqrs
  { match: /\.entity\.ts$/, pattern: "domain/entity-pattern.md" }, // ddd/core
  { match: /\.mapper\.ts$/, pattern: "infrastructure/mapper-pattern.md" }, // kysely
  { match: /\.policy\.ts$/, pattern: "domain/specification-policy-pattern.md" }, // ddd/core
  { match: /\.schema\.ts$/, pattern: "infrastructure/zod-schema-validation-pattern.md" }, // zod
  { match: /\.event\.ts$/, pattern: "domain/domain-event-pattern.md" }, // ddd/core
  { match: /\.cron\.ts$/, pattern: "infrastructure/repository-pattern.md" }, // kysely
  { match: /\.job\.ts$/, pattern: "infrastructure/repository-pattern.md" }, // kysely
  { match: /\.vo\.ts$/, pattern: "domain/value-object-pattern.md" }, // ddd/core
];

module.exports = { PATH_RULES, FILENAME_RULES };
