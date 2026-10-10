
import { apiRequest } from './http.js';

function notifyCartUpdated() {
  window.dispatchEvent(new Event('cart-updated'));
}

export function getCart() {
  return apiRequest('/cart');
}

export async function addToCart(listingId, quantity = 1) {
  const result = await apiRequest('/cart/items', {
    method: 'POST',
    body: { listingId, quantity },
  });

  notifyCartUpdated();
  return result;
}

export async function updateCartItem(listingId, quantity) {
  const result = await apiRequest(
    `/cart/items/${encodeURIComponent(listingId)}`,
    {
      method: 'PUT',
      body: { quantity },
    },
  );

  notifyCartUpdated();
  return result;
}

export async function removeCartItem(listingId) {
  const result = await apiRequest(
    `/cart/items/${encodeURIComponent(listingId)}`,
    { method: 'DELETE' },
  );

  notifyCartUpdated();
  return result;
}
