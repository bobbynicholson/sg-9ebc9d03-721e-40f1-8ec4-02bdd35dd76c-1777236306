/**
 * ODOC: slug-prefixed mirror so the order document lives under the
 * tenant's friendly URL too. Just re-exports the bare /order/[id]
 * page - middleware routes both shapes here.
 */
import OrderDocumentPage from "@/pages/order/[id]";

export default OrderDocumentPage;
