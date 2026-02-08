## Agent Ecosystem

**3 tiers** (all auto-discovered via symlinks):

| Tier | Agents | Model |
|------|--------|-------|
| Implementation | flutter-implementer, state-manager | Sonnet |
| Verification | code-quality-verifier (Sonnet), ui-verifier (Haiku) | Mixed |
| Utility | codebase-explorer, widget-scaffolder, test-generator | Haiku |

**Cost targets**:

| Model | Target |
|-------|--------|
| Opus | %%COST_OPUS%% |
| Sonnet | %%COST_SONNET%% |
| Haiku | %%COST_HAIKU%% |

---

## Flutter Architecture Rules

- **State Management**: %%STATE_MANAGEMENT%%
- **Widget Organization**: Feature-first structure (`lib/features/{feature}/`)
- **Navigation**: Type-safe routing with GoRouter or auto_route
- **Dependency Injection**: GetIt or Riverpod for DI
- **API Layer**: Retrofit/Dio with freezed models
- **Testing**: Widget tests + integration tests with patrol or integration_test

---

## Key Patterns

- **BLoC Pattern**: Business Logic Component separation
- **Repository Pattern**: Data layer abstraction
- **Freezed Models**: Immutable data classes with unions
- **Golden Tests**: Visual regression testing
- **Platform Channels**: Native communication (%%PLATFORMS%%)
- **Responsive Design**: MediaQuery + LayoutBuilder + ResponsiveBuilder

---

## Testing Strategy

- **Unit Tests (~40%)**: Business logic, repositories, services
- **Widget Tests (~40%)**: UI components, BLoC interactions
- **Integration Tests (~20%)**: E2E flows, navigation, API integration
