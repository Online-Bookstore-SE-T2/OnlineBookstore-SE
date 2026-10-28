
import { apiRequest } from './http.js';

function notifyCartUpdated() {
  window.dispatchEvent(new Event('cart-updated'));
}

// Every cart endpoint answers { cart }; callers receive the cart itself.
export async function getCart() {
  const result = await apiRequest('/cart');
  return result.cart;
}

export async function addToCart(listingId, quantity = 1) {
  const result = await apiRequest('/cart/items', {
    method: 'POST',
    body: { listingId, quantity },
  });

  notifyCartUpdated();
  return result.cart;
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
  return result.cart;
}

export async function removeCartItem(listingId) {
  const result = await apiRequest(
    `/cart/items/${encodeURIComponent(listingId)}`,
    { method: 'DELETE' },
  );

  notifyCartUpdated();
  return result.cart;
}
