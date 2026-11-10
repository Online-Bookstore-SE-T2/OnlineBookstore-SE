// Loads Razorpay Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/)
// once, on demand. Card, UPI and netbanking details are entered in Razorpay's own form.
export const RAZORPAY_CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

let loading = null;

export function loadRazorpay() {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = RAZORPAY_CHECKOUT_URL;
      script.async = true;
      script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay Checkout did not load.')));
      script.onerror = () => {
        script.remove();
        loading = null;
        reject(new Error('Razorpay Checkout could not be loaded. Check your connection and try again.'));
      };
      document.body.appendChild(script);
    });
  }
  return loading;
}
