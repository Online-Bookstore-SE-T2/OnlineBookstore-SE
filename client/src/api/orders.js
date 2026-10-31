import { apiRequest } from './http.js';

export async function listOrders() {
  return (await apiRequest('/orders')).orders;
}

export async function getOrder(orderId) {
  return (await apiRequest(`/orders/${encodeURIComponent(orderId)}`)).order;
}

export async function cancelOrder(orderId) {
  return (await apiRequest(`/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'POST' })).order;
}

export async function listSellerOrders() {
  return (await apiRequest('/orders/seller')).orders;
}

export async function advanceSellerOrder(orderId, status) {
  return (await apiRequest(`/orders/seller/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    body: { status },
  })).order;
}
