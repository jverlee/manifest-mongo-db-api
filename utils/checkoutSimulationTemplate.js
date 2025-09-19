function getCheckoutSimulationHTML(appId, priceId, priceInfo = {}) {
  const { amount = 999, currency = 'usd', productName = 'Test Product', interval = null } = priceInfo;
  
  // Format amount for display (convert cents to dollars)
  const displayAmount = (amount / 100).toFixed(2);
  const currencySymbol = currency === 'usd' ? '$' : currency.toUpperCase();
  const isRecurring = !!interval;
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Checkout</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        /* Custom styles to match Stripe */
        .stripe-input {
          background-color: #fff;
          border: 1px solid #e6e6e6;
          border-radius: 4px;
          padding: 12px 16px;
          font-size: 16px;
          line-height: 1.5;
          transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
        }
        .stripe-input:focus {
          border-color: #0074d4;
          outline: 0;
          box-shadow: 0 0 0 1px #0074d4;
        }
        .stripe-button {
          background-color: #0074d4;
          color: white;
          font-weight: 500;
          border-radius: 4px;
          padding: 12px 16px;
          font-size: 16px;
          transition: background-color 0.15s ease-in-out;
          border: none;
        }
        .stripe-button:hover {
          background-color: #0063ba;
        }
        .form-field {
          margin-bottom: 16px;
        }
        .form-label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #6b7280;
          margin-bottom: 6px;
        }
        .card-icons {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          gap: 4px;
        }
        .card-icons img {
          height: 20px;
          opacity: 0.6;
        }
      </style>
    </head>
    <body class="bg-white">
      <div class="min-h-screen flex">
        <!-- Main Container -->
        <div class="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto">
          
          <!-- Left Column - Order Summary -->
          <div class="lg:w-2/5 bg-gray-50 p-6 lg:p-12">
            <!-- Header -->
            <div class="mb-8">
              <div class="flex items-center gap-3 mb-1">
                <div class="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                  <svg class="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 16 16">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M14.9977 8.19089C15.6092 7.64898 16.0002 6.87952 16.0002 6V5.90012C16.0002 5.58415 15.9687 5.26896 15.9061 4.95925L15.2757 1.83964L15.2729 1.82792C15.1493 1.3036 14.9237 0.814761 14.4989 0.46826C14.0702 0.118638 13.5447 2.32458e-05 13 2.20537e-05L3 0C2.45536 0 1.92982 0.118541 1.50106 0.46812C1.0761 0.814602 0.850422 1.30347 0.726786 1.8279L0.72402 1.83963L0.0936206 4.95927C0.0310375 5.26897 -0.000488281 5.58414 -0.000488281 5.90011V6C-0.000488281 6.87964 0.390631 7.64918 1.00228 8.19109C1.00077 8.21053 1 8.23017 1 8.25V13.75C1 14.9926 2.00736 16 3.25 16H12.75C13.9926 16 15 14.9926 15 13.75V8.25C15 8.2301 14.9992 8.21039 14.9977 8.19089Z"/>
                  </svg>
                </div>
                <h1 class="text-sm font-medium text-gray-800">Test Merchant</h1>
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-800 text-white">
                  <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 16 16">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M7.09793 1.68763C7.36276 1.56405 7.65145 1.5 7.9437 1.5H8.0563C8.34855 1.5 8.63724 1.56405 8.90207 1.68763L14.8458 4.46136C15.5499 4.78996 16 5.49668 16 6.27373V9.76393C16 10.5215 15.572 11.214 14.8944 11.5528L9.63344 14.1833C9.21687 14.3916 8.75753 14.5 8.2918 14.5H7.7082C7.24247 14.5 6.78313 14.3916 6.36656 14.1833L1.10557 11.5528C0.428006 11.214 0 10.5215 0 9.76393V6.27373C0 5.49668 0.45008 4.78996 1.15423 4.46136L7.09793 1.68763Z"/>
                  </svg>
                  Sandbox
                </span>
              </div>
            </div>
            
            <!-- Product Summary -->
            <div class="mb-8">
              <h2 class="text-base font-medium text-gray-500 mb-4">${isRecurring ? 'Subscribe to ' : ''}${productName}</h2>
              <div class="flex justify-between items-baseline">
                <div class="flex items-baseline gap-2">
                  <span class="text-2xl font-semibold text-gray-900">${currencySymbol}${displayAmount}</span>
                  ${interval ? `<span class="text-sm text-gray-500">per ${interval}</span>` : ''}
                </div>
              </div>
              ${productName && productName !== 'Test Product' ? `<p class="mt-2 text-sm text-gray-500">Product created by Manifest platform for app ${appId}</p>` : ''}
            </div>

            <!-- Test Mode Alert -->
            <div class="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div class="flex gap-3">
                <svg class="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                </svg>
                <div class="flex-1">
                  <h3 class="text-sm font-medium text-yellow-900 mb-1">Test Environment</h3>
                  <p class="text-sm text-yellow-700">This is a simulated checkout. No payment will be processed.</p>
                  <div class="mt-2 text-xs text-yellow-600 space-y-1">
                    <div>App ID: ${appId}</div>
                    <div>Price ID: ${priceId}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column - Payment Form -->
          <div class="lg:w-3/5 p-6 lg:p-12">
            <!-- Express Checkout (Simulated) -->
            <div class="mb-6">
              <div class="p-3 border border-gray-200 rounded-lg bg-gray-50 text-center text-gray-400">
                <div class="flex items-center justify-center gap-2">
                  <span class="text-sm">Apple Pay • Google Pay • PayPal</span>
                  <span class="text-xs">(disabled in test mode)</span>
                </div>
              </div>
              <div class="flex items-center my-4">
                <div class="flex-1 h-px bg-gray-200"></div>
                <span class="px-3 text-sm text-gray-400">Or</span>
                <div class="flex-1 h-px bg-gray-200"></div>
              </div>
            </div>

            <!-- Email Field -->
            <div class="form-field">
              <label class="form-label">Email</label>
              <input type="email" class="stripe-input w-full" value="test@example.com" readonly style="background-color: #f9fafb; cursor: not-allowed;">
            </div>

            <!-- Payment Method Header -->
            <h2 class="text-base font-medium text-gray-800 mb-4">Payment method</h2>

            <!-- Card Information -->
            <div class="form-field">
              <label class="form-label">Card information</label>
              <div class="relative">
                <input type="text" class="stripe-input w-full pr-24" value="4242 4242 4242 4242" readonly style="background-color: #f9fafb; cursor: not-allowed;">
                <div class="card-icons">
                  <img src="https://js.stripe.com/v3/fingerprinted/img/visa-729c05c240c4bdb47b03ac81d9945bfe.svg" alt="Visa">
                  <img src="https://js.stripe.com/v3/fingerprinted/img/mastercard-4d8844094130711885b5e41b28c9848f.svg" alt="MasterCard">
                  <img src="https://js.stripe.com/v3/fingerprinted/img/amex-a49b82f46c5cd6a96a6e418a6ca1717c.svg" alt="American Express">
                </div>
              </div>
              <div class="flex gap-3 mt-0">
                <input type="text" class="stripe-input flex-1" value="12 / 34" readonly style="background-color: #f9fafb; cursor: not-allowed; border-top: none; border-top-left-radius: 0; border-top-right-radius: 0;">
                <div class="relative flex-1">
                  <input type="text" class="stripe-input w-full pr-8" value="123" readonly style="background-color: #f9fafb; cursor: not-allowed; border-top: none; border-top-left-radius: 0; border-top-right-radius: 0;">
                  <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%);">
                    <svg width="30" height="20" viewBox="0 0 30 20" fill="#9ca3af">
                      <path d="M25.2061 0.00488281C27.3194 0.112115 29 1.85996 29 4V11.3291C28.5428 11.0304 28.0336 10.8304 27.5 10.7188V8H1.5V16C1.5 17.3807 2.61929 18.5 4 18.5H10.1104V20H4L3.79395 19.9951C1.7488 19.8913 0.108652 18.2512 0.00488281 16.2061L0 16V4C0 1.85996 1.68056 0.112115 3.79395 0.00488281L4 0H25L25.2061 0.00488281ZM4 1.5C2.61929 1.5 1.5 2.61929 1.5 4V5H27.5V4C27.5 2.61929 26.3807 1.5 25 1.5H4Z"/>
                      <path d="M26.3822 20.01C24.9722 20.01 23.8522 19.25 23.6422 17.81L24.8722 17.58C24.9922 18.45 25.6022 18.95 26.3622 18.95C27.1422 18.95 27.6922 18.53 27.6922 17.79C27.6922 17.05 27.1122 16.72 26.2822 16.72H25.5722V15.67H26.3022C27.0622 15.67 27.5622 15.34 27.5622 14.7C27.5622 14.07 27.1022 13.68 26.3922 13.68C25.6422 13.68 25.1322 14.18 24.9822 14.92L23.8122 14.76C24.0022 13.55 24.9822 12.61 26.4322 12.61C27.8822 12.61 28.7722 13.47 28.7722 14.64C28.7722 15.4 28.2722 15.94 27.6522 16.17C28.3422 16.39 28.9222 16.94 28.9222 17.89C28.9222 19.04 27.9522 20.01 26.3822 20.01Z"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <!-- Cardholder Name -->
            <div class="form-field">
              <label class="form-label">Cardholder name</label>
              <input type="text" class="stripe-input w-full" value="Test User" readonly style="background-color: #f9fafb; cursor: not-allowed;">
            </div>

            <!-- Country/ZIP -->
            <div class="form-field">
              <label class="form-label">Country or region</label>
              <select class="stripe-input w-full" disabled style="background-color: #f9fafb; cursor: not-allowed;">
                <option>United States</option>
              </select>
              <input type="text" class="stripe-input w-full mt-0" value="12345" readonly style="background-color: #f9fafb; cursor: not-allowed; border-top: none; border-top-left-radius: 0; border-top-right-radius: 0;" placeholder="ZIP">
            </div>

            <!-- Stripe Link -->
            <div class="form-field">
              <div class="flex items-center">
                <input type="checkbox" id="save-info" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded" checked disabled>
                <label for="save-info" class="ml-2 text-sm text-gray-600">Save my information for faster checkout</label>
              </div>
              <p class="text-xs text-gray-500 mt-1">Pay securely at Test Merchant and everywhere <a href="#" class="text-blue-600 underline">Link</a> is accepted.</p>
            </div>

            <!-- Phone Number -->
            <div class="form-field">
              <div class="flex">
                <select class="stripe-input rounded-r-none border-r-0" disabled style="background-color: #f9fafb; cursor: not-allowed; width: 120px;">
                  <option>🇺🇸 +1</option>
                </select>
                <input type="tel" class="stripe-input flex-1 rounded-l-none" value="(201) 555-0123" readonly style="background-color: #f9fafb; cursor: not-allowed;">
              </div>
            </div>

            <!-- Submit Button -->
            <button onclick="handleCheckout()" class="stripe-button w-full mt-6 text-center">
              ${isRecurring ? 'Subscribe' : 'Pay'} ${currencySymbol}${displayAmount}
            </button>

            <!-- Terms -->
            <div class="mt-4 text-xs text-gray-500 text-center space-y-1">
              <p>By ${isRecurring ? 'subscribing' : 'paying'}, you authorize Test Merchant to charge you according to the terms until you cancel.</p>
              <p>You also agree to the Link <a href="#" class="text-blue-600 underline">Terms</a> and <a href="#" class="text-blue-600 underline">Privacy Policy</a>.</p>
            </div>

            <!-- Footer -->
            <div class="mt-8 pt-6 border-t border-gray-200">
              <div class="flex items-center justify-center gap-4 text-xs text-gray-400">
                <div class="flex items-center gap-1">
                  <span>Powered by</span>
                  <svg width="33" height="15" viewBox="0 0 33 15" fill="currentColor">
                    <path d="M32.956 7.925c0-2.313-1.12-4.138-3.261-4.138-2.15 0-3.451 1.825-3.451 4.12 0 2.719 1.535 4.092 3.74 4.092 1.075 0 1.888-.244 2.502-.587V9.605c-.614.307-1.319.497-2.213.497-.876 0-1.653-.307-1.753-1.373h4.418c0-.118.018-.588.018-.804zm-4.463-.859c0-1.02.624-1.445 1.193-1.445.55 0 1.138.424 1.138 1.445h-2.33zM22.756 3.787c-.885 0-1.454.415-1.77.704l-.118-.56H18.88v10.535l2.259-.48.009-2.556c.325.235.804.57 1.6.57 1.616 0 3.089-1.302 3.089-4.166-.01-2.62-1.5-4.047-3.08-4.047zm-.542 6.225c-.533 0-.85-.19-1.066-.425l-.009-3.352c.235-.262.56-.443 1.075-.443.822 0 1.391.922 1.391 2.105 0 1.211-.56 2.115-1.39 2.115zM18.04 2.766V.932l-2.268.479v1.843zM15.772 3.94h2.268v7.905h-2.268zM13.342 4.609l-.144-.669h-1.952v7.906h2.259V6.488c.533-.696 1.436-.57 1.716-.47V3.94c-.289-.108-1.346-.307-1.879.669zM8.825 1.98l-2.205.47-.009 7.236c0 1.337 1.003 2.322 2.34 2.322.741 0 1.283-.135 1.581-.298V9.876c-.289.117-1.716.533-1.716-.804V5.865h1.716V3.94H8.816l.009-1.96zM2.718 6.235c0-.352.289-.488.767-.488.687 0 1.554.208 2.241.578V4.202a5.958 5.958 0 0 0-2.24-.415c-1.835 0-3.054.957-3.054 2.557 0 2.493 3.433 2.096 3.433 3.17 0 .416-.361.552-.867.552-.75 0-1.708-.307-2.467-.723v2.15c.84.362 1.69.515 2.467.515 1.879 0 3.17-.93 3.17-2.548-.008-2.692-3.45-2.213-3.45-3.225z"/>
                  </svg>
                </div>
                <a href="#" class="hover:text-gray-600">Terms</a>
                <a href="#" class="hover:text-gray-600">Privacy</a>
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