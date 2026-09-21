# Central database map — Supabase project `VinniPos` (`ywylhzcxuoeilygzdonx`, Mumbai ap-south-1, Postgres 17)

Read-only snapshot taken 2026-09-22_0235 (backup file in `backups/`, not committed). 72 tables in `public`; row-level security on for all but `schema_migrations`; 140 policies; 29 functions. Storage bucket: `item-images` (public). Schema history: `public.schema_migrations` lists the OS repository's migrations `0001`–`0020`.

Row counts are as of the snapshot. Column lists are for orientation; the backup holds full definitions.

## OS kernel: organizations, people, roles, modules, plans

| Table | Rows | Policies | Columns |
|---|---|---|---|
| `organizations` | 9 | 5 | id, name, slug, type, status, legal_name, gstin, contact_email, contact_phone, settings, created_by, created_at, updated_at, theme, source_lead_id, onboarding_stage, onboarding_owner, lifecycle_stage |
| `locations` | 0 | 1 | id, organization_id, name, kind, code, address, city, franchisee_name, is_primary, created_by, created_at, updated_at |
| `org_users` | 26 | 5 | id, organization_id, user_id, role_id, email, full_name, status, created_at, updated_at |
| `org_invites` | 8 | 1 | id, organization_id, role_id, token, created_by, expires_at, accepted_at, accepted_email, created_at |
| `roles` | 19 | 1 | id, slug, name, description, is_system, created_at |
| `role_module_access` | 32 | 2 | id, organization_id, role_id, module_key, visible, created_at, updated_at |
| `platform_admins` | 7 | 1 | user_id, email, created_at, role, full_name |
| `modules` | 10 | 2 | key, name, group, description, submodules, is_core, sort_order |
| `org_modules` | 70 | 2 | organization_id, module_key, enabled, config, created_at, updated_at |
| `plans` | 3 | 2 | tier, name, price_monthly, trial_days, module_keys, blurb, sort_order |
| `subscriptions` | 1 | 1 | id, organization_id, tier, status, mrr, started_at, trial_ends_at, current_period_start, current_period_end, cancelled_at, cancel_reason, created_by, created_at, updated_at |
| `subscription_events` | 2 | 1 | id, subscription_id, organization_id, event, from_tier, to_tier, mrr_delta, note, actor, created_at |
| `org_domains` | 2 | 2 | id, organization_id, domain, kind, is_primary, verified_at, created_at |
| `org_counters` | 8 | 2 | organization_id, kind, value |
| `org_bill_settings` | 3 | 4 | organization_id, legal_name, address, gstin, fssai, phone, sgst_pct, cgst_pct, service_charge_pct, round_off_enabled, footer_note, updated_at |
| `org_workflows` | 9 | 2 | id, organization_id, key, name, module, version, definition, is_active, created_by, created_at, updated_at |
| `workflow_runs` | 0 | 4 | id, organization_id, workflow_id, workflow_version, subject_type, subject_id, current_node, status, state, created_at, updated_at |
| `notifications` | 17 | 1 | id, user_id, team, title, body, link, read_at, created_at |

## Sales and onboarding (leads to go-live)

| Table | Rows | Policies | Columns |
|---|---|---|---|
| `leads` | 5 | 1 | id, business_name, contact_name, contact_phone, source, referrer_name, assigned_to, status, created_by, created_at, updated_at, customer_id |
| `lead_events` | 4 | 1 | id, lead_id, from_status, to_status, note, actor, created_at |
| `deals` | 1 | 1 | id, lead_id, brief, quote_amount, plan, status, created_by, created_at, updated_at |
| `deal_events` | 0 | 1 | id, deal_id, from_status, to_status, note, actor, created_at |
| `deal_payments` | 0 | 1 | id, deal_id, amount, method, reference, received_at, recorded_by, created_at |
| `commissions` | 1 | 1 | id, lead_id, deal_id, partner_name, basis, rate_percent, amount, status, approved_at, paid_at, created_at, updated_at |
| `customers` | 1 | 1 | id, full_name, email, phone, notes, created_by, created_at, updated_at |
| `customer_organizations` | 1 | 1 | id, customer_id, organization_id, relation, created_at |
| `requirements` | 2 | 1 | id, title, detail, organization_id, lead_id, source, status, disposition, owner, created_by, created_at, updated_at |
| `requirement_events` | 2 | 1 | id, requirement_id, from_status, to_status, disposition, note, actor, created_at |
| `demo_plans` | 1 | 1 | id, organization_id, scheduled_for, participants, held_at, owner, created_at, updated_at |
| `demo_plan_items` | 1 | 1 | id, demo_plan_id, requirement_id, title, screen, success_criteria, position, covered, created_at |
| `discovery_sessions` | 0 | 1 | id, organization_id, objective, participants, scheduled_for, held_at, decisions, open_questions, customer_confirmed, owner, created_at, updated_at |
| `readiness_checks` | 0 | 1 | id, organization_id, item, passed, note, checked_by, checked_at, position, created_at |
| `training_records` | 0 | 1 | id, organization_id, person_name, role_label, topics, completed, completed_at, created_by, created_at |
| `handoffs` | 1 | 1 | id, from_team, to_team, organization_id, lead_id, context, accepted_by, accepted_at, created_by, created_at |
| `work_items` | 1 | 1 | id, kind, title, detail, status, team, assigned_to, organization_id, lead_id, due_at, blocked_reason, created_by, origin, completed_at, completed_by, created_at, updated_at, escalated_at, escalation_note |
| `work_evidence` | 0 | 1 | id, work_item_id, kind, content, created_by, created_at |
| `activities` | 7 | 1 | id, kind, summary, detail, organization_id, lead_id, work_item_id, actor, actor_label, created_at |
| `interactions` | 0 | 1 | id, kind, summary, detail, occurred_at, lead_id, organization_id, participants, actor, created_at |
| `feedback` | 0 | 1 | id, organization_id, demo_plan_id, requirement_id, body, said_by, screen, disposition, resolved, created_by, created_at, updated_at |
| `account_reviews` | 1 | 1 | id, organization_id, cadence, scheduled_for, held_at, orders_count, average_order_value, repeat_customer_pct, cancellation_pct, customer_rating, discussion, actions_agreed, outcome, owner, created_at, updated_at |
| `bot_runs` | 0 | 1 | id, bot, model, organization_id, lead_id, input_context, output, status, initiated_by, approved_by, approved_at, error, created_at |
| `invoices` | 2 | 1 | id, organization_id, subscription_id, number, amount, status, period_start, period_end, due_at, paid_at, method, reference, created_at, updated_at |

## Restaurant POS (VINII)

| Table | Rows | Policies | Columns |
|---|---|---|---|
| `menu_categories` | 23 | 5 | id, organization_id, name, sort_order, created_at |
| `menu_items` | 74 | 5 | id, organization_id, category_id, name, sku, price, image_url, is_available, sort_order, created_at, updated_at, description, food_type, course, is_recommended, prep_minutes, station |
| `menu_item_variants` | 22 | 4 | id, organization_id, menu_item_id, name, price, is_default, sort_order |
| `dining_areas` | 8 | 4 | id, organization_id, name, sort_order, created_at |
| `dining_tables` | 49 | 5 | id, organization_id, label, seats, is_active, sort_order, created_at, area_id, qr_token, min_capacity |
| `table_sessions` | 27 | 4 | id, organization_id, table_id, pin, guest_name, guest_phone, guest_count, status, opened_at, closed_at |
| `kitchen_stations` | 9 | 4 | id, organization_id, key, name, colour, sort_order |
| `kot_tickets` | 21 | 5 | id, organization_id, order_id, kot_no, station, status, priority, created_at, updated_at |
| `orders` | 41 | 5 | id, organization_id, order_no, display_no, channel, status, table_id, customer_name, customer_phone, captain_name, subtotal, gst_pct, gst_amount, total, payment_method, created_by, created_at, updated_at, session_id, placed_by, guest_count, discount, service_charge, round_off, paid_at, notes, external_ref |
| `order_items` | 116 | 5 | id, order_id, menu_item_id, name, qty, unit_price, add_ons, notes, created_at, variant_name, status, kot_ticket_id, course, station |
| `order_events` | 71 | 4 | id, organization_id, order_id, kind, message, actor, meta, created_at |
| `payments` | 12 | 4 | id, organization_id, order_id, method, amount, reference, created_by, created_at |
| `service_requests` | 11 | 4 | id, organization_id, table_id, session_id, kind, note, status, created_at, resolved_at |
| `channel_integrations` | 12 | 4 | id, organization_id, channel, display_name, is_connected, is_accepting, next_open_at, auto_accept, commission_pct, config, updated_at |
| `item_channel_status` | 0 | 4 | organization_id, menu_item_id, channel, is_available, off_until, updated_at |

## One Local — first draft, empty (created from the superseded migrations_ol.sql)

| Table | Rows | Policies | Columns |
|---|---|---|---|
| `ol_banners` | 0 | 1 | id, title, subtitle, image, bg |
| `ol_booking_enquiries` | 0 | 0 | id, event_id, name, phone, date, slot, guests, status, created_at |
| `ol_brands` | 0 | 1 | id, name, department, logo, image, tagline |
| `ol_catalog_assets` | 0 | 1 | id, storage_path, content_type |
| `ol_categories` | 0 | 1 | id, name, emoji, color, department, image |
| `ol_coupons` | 0 | 1 | code, label, kind, value, min_order, description |
| `ol_discover_chips` | 0 | 1 | id, label, emoji, color |
| `ol_events` | 0 | 1 | id, title, kind, subtitle, venue, price, image, tag, slots |
| `ol_orders` | 0 | 0 | id, items, subtotal, discount, delivery_fee, total, coupon_code, payment_method, payment_status, status, rider_name, rider_phone, eta_minutes, created_at |
| `ol_products` | 0 | 1 | id, name, weight, price, mrp, image, category_id, store_id, brand_id, department, delivery_min, discount_pct, rating |
| `ol_reels` | 0 | 1 | id, product_id, brand_id, video, caption, creator, likes, tag |
| `ol_stores` | 0 | 1 | id, name, logo, tagline, delivery_time, rating, tags, media, department |
| `ol_support_requests` | 0 | 0 | id, data, created_at |
| `ol_themed_stores` | 0 | 1 | id, data |

## Migration bookkeeping

| Table | Rows | Policies | Columns |
|---|---|---|---|
| `schema_migrations` | 20 | 0 | name, applied_at |

