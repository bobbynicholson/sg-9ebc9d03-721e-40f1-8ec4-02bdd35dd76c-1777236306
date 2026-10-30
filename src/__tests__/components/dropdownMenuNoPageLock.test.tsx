// An open menu must not lock the rest of the page: a modal menu whose item
// opened a dialog left body pointer-events "none" behind, so the app looked
// frozen until a reload.
import { render } from "@testing-library/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function Menu(props: { modal?: boolean }) {
  return (
    <DropdownMenu open modal={props.modal}>
      <DropdownMenuTrigger>More actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Edit lead</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

test("an open menu leaves the page clickable by default", () => {
  render(<Menu />);
  expect(document.body.style.pointerEvents).not.toBe("none");
});

test("a menu can still opt in to modal behaviour", () => {
  render(<Menu modal />);
  expect(document.body.style.pointerEvents).toBe("none");
});
