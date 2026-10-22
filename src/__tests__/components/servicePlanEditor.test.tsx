import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdminServicePlanEditor } from "@/components/quote/AdminServicePlanEditor";
function Fixture() {
  const [value, setValue] = useState([{ guestCount: 50, serviceTime: "12:00" }, { guestCount: 50, serviceTime: "04:30" }]);
  return <AdminServicePlanEditor totalGuests={100} value={value} onChange={setValue} />;
}
test("both requested times remain visible and editable", () => { render(<Fixture />); expect(screen.getByLabelText("Sitting 2 service time")).toHaveValue("04:30"); fireEvent.change(screen.getByLabelText("Sitting 2 service time"), { target: { value: "18:00" } }); expect(screen.getByLabelText("Sitting 2 service time")).toHaveValue("18:00"); expect(screen.getByLabelText("Sitting 1 service time")).toHaveValue("12:00"); });
test("a changed guest split shows the missing allocation", () => { render(<Fixture />); fireEvent.change(screen.getByLabelText("Sitting 1 guests"), { target: { value: "40" } }); expect(screen.getByText(/90 of 100 guests allocated/)).toBeVisible(); });
test("removing a sitting requires the operator to reallocate its guests", () => { render(<Fixture />); fireEvent.click(screen.getByRole("button", { name: "Remove sitting 2" })); expect(screen.queryByLabelText("Sitting 2 service time")).toBeNull(); expect(screen.getByText(/50 of 100 guests allocated/)).toBeVisible(); });
