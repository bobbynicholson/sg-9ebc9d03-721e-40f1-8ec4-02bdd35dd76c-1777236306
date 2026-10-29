import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuoteItemsEditor } from "@/components/quote/QuoteItemsEditor";

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, menu_catalogue: [], equipment_catalogue: [] }) });
});

test("StrictMode mounting and catalogue loading do not mark existing items as edited", async () => {
  const onChange = jest.fn();
  render(<StrictMode><QuoteItemsEditor token="fixture" menuInit={[]} equipInit={[]} currencyFmt={String} onChange={onChange}/></StrictMode>);
  await waitFor(() => expect(screen.queryByText('Loading options...')).toBeNull());
  expect(onChange).not.toHaveBeenCalled();
});

test("quantity changes and removing the final line report actual edits once", async () => {
  const onChange = jest.fn();
  render(<StrictMode><QuoteItemsEditor token="fixture" menuInit={[{ id: 'dish', item_name: 'Fixture dish', quantity: 5, unit_price: 10 }]} equipInit={[]} currencyFmt={String} onChange={onChange}/></StrictMode>);
  await waitFor(() => expect(screen.queryByText('Loading options...')).toBeNull());
  fireEvent.change(screen.getByLabelText('Quantity for Fixture dish'), { target: { value: '8' } });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ menu_item_id: 'dish', quantity: 8 })], []);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Fixture dish' }));
  expect(onChange).toHaveBeenCalledTimes(2);
  expect(onChange).toHaveBeenLastCalledWith([], []);
});
