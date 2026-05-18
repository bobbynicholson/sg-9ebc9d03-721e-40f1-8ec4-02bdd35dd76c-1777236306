/**
 * /team-portal/kitchen/today - Wave 70.7
 *
 * The new primary entry point for the kitchen portal. Re-exports
 * the existing /dashboard page so this is a pure rename / alias --
 * no duplication, no fork. The old /dashboard route stays valid so
 * bookmarks and external links keep working.
 *
 * Why "Today" not "Dashboard": the kitchen user's primary mental
 * frame is "what's happening today" not "what's my report card".
 * The label change reflects that.
 */
export { default } from "./dashboard";
