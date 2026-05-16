# AGENTS.md

## Feature-based architecture (strict)
- All new code **must** follow the existing feature-based layout under `src/features/{auth,chat,friends,map,profile,upload}/`
- Each feature owns its own router, controllers, services, and validation.
- Shared/common logic goes in `src/shared/` (middleware, types, lib).
