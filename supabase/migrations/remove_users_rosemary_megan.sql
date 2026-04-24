-- Remove Rosemary Tang and Megan Song from all database tables
-- Run this in the Supabase SQL editor (service role / postgres user required)
-- Safe to run multiple times (idempotent via WHERE conditions)

-- ============================================================
-- Step 1: Identify the target user and member IDs
-- ============================================================
-- Preview who will be deleted before running the DELETE block below.
-- Run this SELECT first to confirm the correct records are targeted.


-- ===============================
-- PART 1: PREVIEW USERS TO DELETE
-- ===============================
-- Run this SELECT alone to preview the users/members to be deleted.
SELECT
  u.id   AS user_id,
  u.full_name AS user_name,
  u.phone_number,
  m.id   AS member_id,
  m.display_name AS member_name
FROM public.users  u
LEFT JOIN public.members m ON m.phone_number = u.phone_number
WHERE u.full_name IN ('Rosemary Tang', 'Megan Song')
   OR m.display_name IN ('Rosemary Tang', 'Megan Song');

-- ===============================
-- PART 2: DELETE USERS/MEMBERS
-- ===============================
-- Run the following DO block as a separate query after confirming the preview above.

-- ============================================================
-- Step 2: Delete dependent rows first, then root records
-- Deletion order respects foreign key constraints.
-- ============================================================

DO $$
DECLARE
  target_user_ids   uuid[];
  target_member_ids uuid[];
BEGIN

  -- Collect user IDs
  SELECT array_agg(id) INTO target_user_ids
  FROM public.users
  WHERE full_name IN ('Rosemary Tang', 'Megan Song');

  -- Collect member IDs (by name directly, and via phone-number match with users)
  SELECT array_agg(DISTINCT m.id) INTO target_member_ids
  FROM public.members m
  WHERE m.display_name IN ('Rosemary Tang', 'Megan Song')
     OR m.phone_number IN (
       SELECT phone_number FROM public.users
       WHERE full_name IN ('Rosemary Tang', 'Megan Song')
     );

  RAISE NOTICE 'Target user IDs:   %', target_user_ids;
  RAISE NOTICE 'Target member IDs: %', target_member_ids;

  -- ----------------------------------------------------------
  -- 2a. dish_analysis_events  (user_id column, no FK cascade)
  -- ----------------------------------------------------------
  DELETE FROM public.dish_analysis_events
  WHERE user_id IN (SELECT unnest(target_user_ids));

  -- ----------------------------------------------------------
  -- 2b. group_user_preferences  (individual_id → users.id)
  -- ----------------------------------------------------------
  DELETE FROM public.group_user_preferences
  WHERE individual_id IN (SELECT unnest(target_user_ids));

  -- ----------------------------------------------------------
  -- 2c. group_invites  (invited_by → users.id)
  -- ----------------------------------------------------------
  DELETE FROM public.group_invites
  WHERE invited_by IN (SELECT unnest(target_user_ids));

  -- ----------------------------------------------------------
  -- 2d. group_memberships  (user_id → users.id  AND  member_id → members.id)
  -- ----------------------------------------------------------
  DELETE FROM public.group_memberships
  WHERE user_id  IN (SELECT unnest(target_user_ids))
    OR member_id IN (SELECT unnest(target_member_ids));

  -- ----------------------------------------------------------
  -- 2e. recommendations  (member_id → members.id)
  -- ----------------------------------------------------------
  DELETE FROM public.recommendations
  WHERE member_id IN (SELECT unnest(target_member_ids));


  -- ----------------------------------------------------------
  -- 2f. place_categories - indirectly owned via places
  --     Places saved exclusively by these members are removed.
  --     Shared places (saved by others too) are left intact.
  -- ----------------------------------------------------------
  DELETE FROM public.place_categories
  WHERE place_id IN (
    SELECT p.id FROM public.places p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.recommendations r
      WHERE r.place_id = p.id
        AND r.member_id IS NOT NULL
        AND r.member_id NOT IN (SELECT unnest(target_member_ids))
    )
    AND EXISTS (
      SELECT 1 FROM public.recommendations r
      WHERE r.place_id = p.id
        AND r.member_id IN (SELECT unnest(target_member_ids))
    )
  );

  -- ----------------------------------------------------------
  -- 2g. places - only those exclusively added by these members
  -- ----------------------------------------------------------
  DELETE FROM public.places
  WHERE id IN (
    SELECT p.id FROM public.places p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.recommendations r
      WHERE r.place_id = p.id
        AND r.member_id IS NOT NULL
        AND r.member_id NOT IN (SELECT unnest(target_member_ids))
    )
    AND EXISTS (
      -- safety: only delete if they actually had a recommendation
      SELECT 1 FROM public.recommendations r
      WHERE r.place_id = p.id
        AND r.member_id IN (SELECT unnest(target_member_ids))
    )
  );

  -- ----------------------------------------------------------
  -- 2h. groups created exclusively by these users
  --     (created_by_user_id set null on delete by FK, but
  --      we clean up empty groups that belonged only to them)
  -- ----------------------------------------------------------
  DELETE FROM public.groups
  WHERE created_by_user_id IN (SELECT unnest(target_user_ids))
    AND NOT EXISTS (
      SELECT 1 FROM public.group_memberships gm
      WHERE gm.group_id = groups.id
        AND gm.user_id NOT IN (SELECT unnest(target_user_ids))
    );

  -- ----------------------------------------------------------
  -- 2i. members  (root record)
  -- ----------------------------------------------------------
  DELETE FROM public.members
  WHERE id IN (SELECT unnest(target_member_ids));

  -- ----------------------------------------------------------
  -- 2j. users  (root record - cascades group_memberships,
  --             group_user_preferences, group_invites via FK)
  -- ----------------------------------------------------------
  DELETE FROM public.users
  WHERE id IN (SELECT unnest(target_user_ids));

  RAISE NOTICE 'Deletion complete.';
END $$;
