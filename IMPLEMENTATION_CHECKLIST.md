# KitchenSync Nutrition & Fitness implementation checklist

Only work that has automated or manual verification is checked.

## Foundations

- [x] Existing application regression suite passes before implementation (107/107)
- [x] Additive Prisma migration for nutrition, meal logs, scans and entitlements
- [x] Deterministic decimal BMR, TDEE, macro and recipe nutrition engine
- [ ] Personal profile consent, authorization, edit and delete
- [ ] Free and Premium entitlement enforcement on the API

## Product loop

- [ ] Fitness profile creates versioned calorie and macro targets
- [ ] Pantry-aware nutrition recommendations with explanations and safety filters
- [ ] Manual meal logging and daily progress
- [ ] Cooked-meal scan proposal, review and idempotent confirmation
- [ ] Grocery scan proposal, review and idempotent stock receipt
- [ ] Pantry remains unchanged before scan confirmation
- [ ] Weekly diet-plan preview, validation and confirmation

## Experience

- [ ] Responsive KitchenSync Fit dashboard
- [ ] Free calorie summary and locked Premium previews
- [ ] Development-only Premium toggle
- [ ] Profile editor and privacy/consent copy
- [ ] Scan Food cooked-meal and grocery modes
- [ ] Supportive progress language and incomplete-data indicators

## Quality and delivery

- [ ] Nutrition and authorization tests
- [ ] Scan safety, idempotency and isolation tests
- [x] Existing regression suite passes after implementation (110/110)
- [x] Production build passes
- [ ] Demo fitness fixtures and judge walkthrough
- [x] README and architecture documentation updated
- [ ] Desktop and mobile screenshots captured
- [ ] Final implementation report completed

