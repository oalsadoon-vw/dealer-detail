/**
 * Well-known IDs and values used across the application.
 */

/**
 * The UUID of the auto-seeded "Default Organization" created during the
 * multi-tenant foundation migration. All pre-existing stores are assigned
 * to this org.
 *
 * During the transitional period (before auth is enforced), new stores
 * created through the API will also land here unless an explicit
 * organizationId is provided.
 *
 * This constant will become unnecessary once every request carries a
 * resolved organization context from the authenticated session.
 */
export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
