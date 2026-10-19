-- Atomically toggle one shopping-list item and its linked inventory stock.
--
-- The old browser flow first updated shopping_list_items.purchased and then
-- adjusted inventory_items.current_stock in another request. A failed or
-- ambiguous inventory request left the list saying "bought" while stock was
-- unchanged. This function locks the line, changes it only when necessary,
-- and applies the matching stock delta in the same transaction.

create or replace function public.toggle_shopping_list_item_purchase(
  p_list_item_id uuid,
  p_purchased boolean
)
returns table (
  found boolean,
  changed boolean,
  purchased boolean,
  inventory_item_id uuid,
  quantity numeric,
  source_order_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.shopping_list_items%rowtype;
  v_company_id uuid;
begin
  select sli.*
    into v_item
    from public.shopping_list_items sli
   where sli.id = p_list_item_id
     and sli.removed_at is null
   for update;

  if not found then
    return query select false, false, false, null::uuid, null::numeric, null::uuid;
    return;
  end if;

  select company_id
    into v_company_id
    from public.shopping_lists
   where id = v_item.shopping_list_id;

  if not found then
    raise exception 'Shopping list for item % is missing', p_list_item_id using errcode = 'P0002';
  end if;

  -- The function writes both tables under one lock, so it is SECURITY
  -- DEFINER for shopping staff whose inventory policy can be read-only.
  -- Keep that authority inside the caller's company and role boundary.
  if auth.role() <> 'service_role'
     and not (
       public.current_user_has_any_role(array['super_admin'])
       or (
         v_company_id = public.get_user_company_id((select auth.uid()))
         and public.current_user_has_any_role(array[
           'company_admin', 'owner', 'admin', 'super_admin', 'shopping_staff'
         ])
       )
     ) then
    raise exception 'Not allowed to update this shopping item' using errcode = '42501';
  end if;

  -- A repeat or concurrent same-state request is a successful no-op. It must
  -- not apply stock a second time.
  if coalesce(v_item.purchased, false) = p_purchased then
    return query select true, false, coalesce(v_item.purchased, false),
      v_item.item_id, v_item.quantity::numeric, v_item.source_order_id;
    return;
  end if;

  if v_item.item_id is not null and (v_item.quantity is null or v_item.quantity <= 0) then
    raise exception 'Shopping item % has an invalid quantity', p_list_item_id using errcode = '22023';
  end if;

  update public.shopping_list_items
     set purchased = p_purchased
   where id = v_item.id;

  if v_item.item_id is not null then
    update public.inventory_items i
       set current_stock = coalesce(i.current_stock, 0)
                         + case when p_purchased then v_item.quantity else -v_item.quantity end,
           updated_at = now()
     where i.id = v_item.item_id
       and i.company_id = v_company_id;

    if not found then
      raise exception 'Inventory item for shopping list item % is missing or belongs to another company', p_list_item_id
        using errcode = 'P0002';
    end if;
  end if;

  return query select true, true, p_purchased,
    v_item.item_id, v_item.quantity::numeric, v_item.source_order_id;
end;
$$;

revoke all on function public.toggle_shopping_list_item_purchase(uuid, boolean) from public;
grant execute on function public.toggle_shopping_list_item_purchase(uuid, boolean) to authenticated, service_role;

comment on function public.toggle_shopping_list_item_purchase(uuid, boolean) is
  'Atomically toggles a shopping-list line and the linked inventory stock once.';
