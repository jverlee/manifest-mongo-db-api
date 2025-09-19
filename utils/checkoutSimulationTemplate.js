function getCheckoutSimulationHTML(appId, priceId, priceInfo = {}) {
  const { amount = 999, currency = 'usd', productName = 'Test Product', interval = null } = priceInfo;
  
  // Format amount for display (convert cents to dollars)
  const displayAmount = (amount / 100).toFixed(2);
  const currencySymbol = currency === 'usd' ? '$' : currency.toUpperCase();
  const billingText = interval ? `/${interval}` : ' one-time';
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Checkout - Test Mode</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-50 min-h-screen">
      <!-- Header -->
      <div class="bg-white border-b border-gray-200">
        <div class="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <div class="flex items-center justify-between">
            <h1 class="text-xl font-semibold text-gray-900">Checkout</h1>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              Test Mode
            </span>
          </div>
        </div>
      </div>

      <div class="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Left Column - Payment Form -->
          <div>
            <!-- Test Mode Notice -->
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div class="flex">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-yellow-800">Test Environment</h3>
                  <div class="mt-1 text-sm text-yellow-700">
                    This is a simulated checkout page. No real payment will be processed.
                  </div>
                </div>
              </div>
            </div>

            <!-- Payment Details -->
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 class="text-lg font-medium text-gray-900 mb-6">Payment details</h2>
              
              <!-- Card Information -->
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Card information</label>
                  <div class="bg-gray-50 border border-gray-300 rounded-md p-3">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-sm text-gray-900">4242 4242 4242 4242</span>
                      <div class="flex space-x-1">
                        <img src="https://js.stripe.com/v3/fingerprinted/img/visa-729c05c240c4bdb47b03ac81d9945bfe.svg" alt="Visa" class="h-6">
                      </div>
                    </div>
                    <div class="flex space-x-4">
                      <span class="text-sm text-gray-900">12/34</span>
                      <span class="text-sm text-gray-900">123</span>
                    </div>
                  </div>
                  <p class="mt-2 text-xs text-gray-500">Test card details are pre-filled and cannot be edited</p>
                </div>

                <!-- Email -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <div class="bg-gray-50 border border-gray-300 rounded-md px-3 py-2">
                    <span class="text-sm text-gray-900">test@example.com</span>
                  </div>
                </div>

                <!-- Name on card -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Name on card</label>
                  <div class="bg-gray-50 border border-gray-300 rounded-md px-3 py-2">
                    <span class="text-sm text-gray-900">Test User</span>
                  </div>
                </div>

                <!-- Billing address -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Country or region</label>
                  <div class="bg-gray-50 border border-gray-300 rounded-md px-3 py-2">
                    <span class="text-sm text-gray-900">United States</span>
                  </div>
                </div>
              </div>

              <!-- Submit Button -->
              <button onclick="handleCheckout()" class="mt-6 w-full bg-blue-600 text-white rounded-md py-3 px-4 font-medium hover:bg-blue-700 transition-colors">
                Complete Test Purchase
              </button>

              <p class="mt-4 text-center text-xs text-gray-500">
                By completing this test purchase, you'll be redirected to the success page
              </p>
            </div>
          </div>

          <!-- Right Column - Order Summary -->
          <div>
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 class="text-lg font-medium text-gray-900 mb-6">Order summary</h2>
              
              <!-- Product Details -->
              <div class="space-y-4">
                <div class="flex justify-between">
                  <div>
                    <p class="text-sm font-medium text-gray-900">${productName}</p>
                    <p class="text-sm text-gray-500">${currencySymbol}${displayAmount}${billingText}</p>
                  </div>
                  <p class="text-sm font-medium text-gray-900">${currencySymbol}${displayAmount}</p>
                </div>
              </div>

              <div class="mt-6 pt-6 border-t border-gray-200">
                <div class="flex justify-between">
                  <p class="text-base font-medium text-gray-900">Total</p>
                  <p class="text-base font-medium text-gray-900">${currencySymbol}${displayAmount}</p>
                </div>
                ${interval ? `<p class="mt-1 text-sm text-gray-500">Then ${currencySymbol}${displayAmount} per ${interval}</p>` : ''}
              </div>

              <!-- Additional Test Info -->
              <div class="mt-6 p-4 bg-blue-50 rounded-lg">
                <p class="text-sm text-blue-900 font-medium mb-1">Test Mode Information</p>
                <ul class="text-xs text-blue-700 space-y-1">
                  <li>• App ID: ${appId}</li>
                  <li>• Price ID: ${priceId}</li>
                  <li>• This is a simulated checkout</li>
                  <li>• No actual payment will be processed</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        function handleCheckout() {
          // Get the success URL from the original checkout params
          const urlParams = new URLSearchParams(window.location.search);
          const successUrl = urlParams.get('successUrl') || 'https://app.madewithmanifest.com/';
          
          // Simulate successful checkout by redirecting to success URL
          window.location.href = successUrl;
        }
      </script>
    </body>
    </html>
  `;
}

module.exports = {
  getCheckoutSimulationHTML
};