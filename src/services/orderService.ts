/**
 * Order Service - Main Export Module
 * 
 * This service has been refactored into focused modules:
 * - orderCRUD.ts - Basic CRUD operations
 * - orderWorkflow.ts - Status transitions, assignments
 * - orderFinancials.ts - Payments, invoices, calculations
 * 
 * This file maintains backward compatibility by re-exporting all functions.
 */

import * as crudOps from "./order/orderCRUD";
import * as workflowOps from "./order/orderWorkflow";
import * as financialOps from "./order/orderFinancials";

// Re-export all CRUD operations
export const {
  createOrder,
  getOrderById,
  getAllOrders,
  updateOrder,
  deleteOrder,
  getOrdersByStatus,
  getOrdersByDateRange,
} = crudOps;

// Re-export all workflow operations
export const {
  updateOrderStatus,
  assignDriver,
  assignChef,
  confirmOrder,
  startPreparation,
  markOrderReady,
  startDelivery,
  completeOrder,
  cancelOrder,
} = workflowOps;

// Re-export all financial operations
export const {
  calculateOrderTotal,
  recordPayment,
  updateOrderPaymentStatus,
  getOrderPayments,
  generateInvoice,
} = financialOps;

// Default export for convenience
export const orderService = {
  // CRUD
  createOrder,
  getOrderById,
  getAllOrders,
  updateOrder,
  deleteOrder,
  getOrdersByStatus,
  getOrdersByDateRange,
  
  // Workflow
  updateOrderStatus,
  assignDriver,
  assignChef,
  confirmOrder,
  startPreparation,
  markOrderReady,
  startDelivery,
  completeOrder,
  cancelOrder,
  
  // Financials
  calculateOrderTotal,
  recordPayment,
  updateOrderPaymentStatus,
  getOrderPayments,
  generateInvoice,
};

export default orderService;