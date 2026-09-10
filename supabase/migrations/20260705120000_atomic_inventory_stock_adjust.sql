-- Atomic inventory stock adjustment.
--
-- Replaces the client-side read-modify-write in
-- useActiveShoppingList.togglePurchased (read current_stock -> add delta
-- -> write). With multiple shoppers ticking items at the same time, two
-- callers read the same current_stock and the second write clobbers the
-- first -> lost update. This does the increment in a single atomic UPDATE
-- so concurrent ticks compose correctly.
--
-- SECURITY DEFINER so shopping staff (whose RLS may not grant a direct
-- UPDATE on inventory_items) can call it, but scoped to the caller's own
-- company via the profiles lookup so it can't touch another tenant's stock.
create or replace function public.adjust_inventory_stock(p_item_id uuid, p_delta numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new numeric;
begin
  update inventory_items i
     set current_stock = coalesce(i.current_stock, 0) + p_delta,
         updated_at = now()
   where i.id = p_item_id
     and i.company_id = (select p.company_id from profiles p where p.id = auth.uid())
  returning i.current_stock into v_new;
  return v_new; -- null when no row matched (wrong company / missing item)
end;
$$;

grant execute on function public.adjust_inventory_stock(uuid, numeric) to authenticated, service_role;
