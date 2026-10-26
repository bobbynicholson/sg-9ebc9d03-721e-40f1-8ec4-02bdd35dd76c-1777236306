import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PublicQuotePage from "@/pages/q/[token]";
import { fetchByToken, recordAccept, submitChangeRequest } from "@/services/publicQuoteService";
jest.mock("next/router",()=>({useRouter:()=>({query:{token:"test-token",stay:"1"},replace:jest.fn()})}));
jest.mock("next/head",()=>({__esModule:true,default:()=>null}));
jest.mock("@/components/cancellation/CancellationWizard",()=>({CancellationWizard:()=>null}));
jest.mock("@/lib/branding/applyBranding",()=>({applyBrandingToDOM:jest.fn(),loadBrandFonts:jest.fn()}));
jest.mock("@/services/publicQuoteService",()=>({fetchByToken:jest.fn(),recordView:jest.fn(async()=>{}),recordAccept:jest.fn(async()=>({ok:false,error:"Synthetic retry"})),submitChangeRequest:jest.fn(async()=>({ok:true}))}));
const quote={id:"test-quote",quote_number:"TEST-100",quote_name:"Test booking",client_name:"Test Client",guest_count:100,event_date:"2099-11-06",event_time:"12:00",venue_address:"Test venue",menu_items:[],equipment_items:[],subtotal:10000,total:10000,total_amount:10000,status:"sent",deposit_percentage:50,company:{id:"test-company",company_name:"Test Caterer",currency:"ZAR"},service_sittings:[{sequence_number:1,guest_count:40,service_time:"12:00"},{sequence_number:2,guest_count:60,service_time:"18:00"}]};
beforeEach(()=>{jest.clearAllMocks();(fetchByToken as jest.Mock).mockResolvedValue(quote);});
test("customers can describe changes and edit menu or equipment items",async()=>{
  const {container}=render(<PublicQuotePage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Need a tweak'}));
  expect(screen.getByText('Adjust your items (optional)')).toBeTruthy();
  const message=screen.getByLabelText('What would you like changed?');
  fireEvent.change(message,{target:{value:'Please arrange two sittings for our 100 guests. We will confirm the times with your team.'}});
  expect(container.querySelectorAll('input[type="time"],input[type="number"],input[type="date"]')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Send to caterer'}));
  await waitFor(()=>expect(submitChangeRequest).toHaveBeenCalledWith({token:'test-token',message:expect.stringContaining('two sittings'),submitterName:'Test Client',requestedChanges:{menu_items:null,equipment_items:null}}));
});
test("acceptance confirms the displayed staff plan without editable timing controls",async()=>{
  const {container}=render(<PublicQuotePage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Accept this quote'}));
  fireEvent.change(screen.getByPlaceholderText('Your full name'),{target:{value:'Test Client'}});
  expect(container.querySelectorAll('input[type="time"],input[type="number"]')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Accept quote'}));
  await waitFor(()=>expect(recordAccept).toHaveBeenCalledWith({token:'test-token',acceptedByName:'Test Client'}));
});
