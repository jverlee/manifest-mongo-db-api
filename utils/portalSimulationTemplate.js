function getPortalSimulationHTML(appId, userData = {}, simulationData = {}, availablePlans = [], currentSubscription = null) {
  const { displayName = 'Test User', email = 'test@example.com' } = userData;
  const { priceId, status = 'current', subscribedAt } = simulationData;
  
  // Extract current plan info from real subscription data
  let currentPlan = null;
  let subscriptionDate = null;
  let planAmount = null;
  let planCurrency = 'usd';
  let planInterval = null;
  let planName = 'Unknown Plan';
  
  if (currentSubscription && currentSubscription.items?.data?.[0]?.price) {
    const price = currentSubscription.items.data[0].price;
    currentPlan = price;
    planAmount = price.unit_amount;
    planCurrency = price.currency;
    planInterval = price.recurring?.interval;
    planName = price.product?.name || price.nickname || 'Subscription Plan';
    subscriptionDate = new Date(currentSubscription.current_period_start * 1000).toLocaleDateString('en-US', { 
      year: 'numeric', month: 'long', day: 'numeric' 
    });
  } else if (subscribedAt) {
    subscriptionDate = new Date(subscribedAt).toLocaleDateString('en-US', { 
      year: 'numeric', month: 'long', day: 'numeric' 
    });
  }
  
  // Format pricing
  const formatPrice = (amount, currency) => {
    const symbol = currency === 'usd' ? '$' : currency.toUpperCase();
    return `${symbol}${(amount / 100).toFixed(2)}`;
  };
  
  // Get current plan ID for comparison
  const currentPriceId = currentPlan?.id || priceId;
  
  // Filter available plans to exclude current plan and organize by pricing
  const otherPlans = availablePlans
    .filter(plan => plan.id !== currentPriceId)
    .sort((a, b) => (a.unit_amount || 0) - (b.unit_amount || 0));
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Customer Portal</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        /* Custom styles to match Stripe portal */
        .stripe-card {
          background: white;
          border: 1px solid #e6ebf1;
          border-radius: 6px;
          padding: 24px;
        }
        .stripe-button {
          background-color: #5469d4;
          color: white;
          font-weight: 500;
          border-radius: 6px;
          padding: 10px 20px;
          font-size: 14px;
          transition: background-color 0.15s ease-in-out;
          border: none;
          cursor: pointer;
        }
        .stripe-button:hover {
          background-color: #4f46e5;
        }
        .stripe-button-danger {
          background-color: #dc2626;
          color: white;
        }
        .stripe-button-danger:hover {
          background-color: #b91c1c;
        }
        .stripe-button:disabled {
          background-color: #9ca3af;
          cursor: not-allowed;
        }
        .section-title {
          font-size: 18px;
          font-weight: 600;
          color: #1a202c;
          margin-bottom: 16px;
        }
      </style>
    </head>
    <body class="bg-gray-50 min-h-screen">
      <!-- Header -->
      <div class="bg-white border-b border-gray-200">
        <div class="max-w-5xl mx-auto px-4 py-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center">
                <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 16 16">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M14.9977 8.19089C15.6092 7.64898 16.0002 6.87952 16.0002 6V5.90012C16.0002 5.58415 15.9687 5.26896 15.9061 4.95925L15.2757 1.83964L15.2729 1.82792C15.1493 1.3036 14.9237 0.814761 14.4989 0.46826C14.0702 0.118638 13.5447 2.32458e-05 13 2.20537e-05L3 0C2.45536 0 1.92982 0.118541 1.50106 0.46812C1.0761 0.814602 0.850422 1.30347 0.726786 1.8279L0.72402 1.83963L0.0936206 4.95927C0.0310375 5.26897 -0.000488281 5.58414 -0.000488281 5.90011V6C-0.000488281 6.87964 0.390631 7.64918 1.00228 8.19109C1.00077 8.21053 1 8.23017 1 8.25V13.75C1 14.9926 2.00736 16 3.25 16H12.75C13.9926 16 15 14.9926 15 13.75V8.25C15 8.2301 14.9992 8.21039 14.9977 8.19089Z"/>
                </svg>
              </div>
              <h1 class="text-xl font-medium text-gray-900">Customer Portal</h1>
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 16 16">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M7.09793 1.68763C7.36276 1.56405 7.65145 1.5 7.9437 1.5H8.0563C8.34855 1.5 8.63724 1.56405 8.90207 1.68763L14.8458 4.46136C15.5499 4.78996 16 5.49668 16 6.27373V9.76393C16 10.5215 15.572 11.214 14.8944 11.5528L9.63344 14.1833C9.21687 14.3916 8.75753 14.5 8.2918 14.5H7.7082C7.24247 14.5 6.78313 14.3916 6.36656 14.1833L1.10557 11.5528C0.428006 11.214 0 10.5215 0 9.76393V6.27373C0 5.49668 0.45008 4.78996 1.15423 4.46136L7.09793 1.68763Z"/>
                </svg>
                Test Mode
              </span>
            </div>
            <button onclick="window.history.back()" class="text-sm text-gray-600 hover:text-gray-900">
              ← Return to app
            </button>
          </div>
          
          <!-- Test Mode Alert -->
          <div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div class="flex gap-3">
              <svg class="w-5 h-5 text-yellow-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
              </svg>
              <div>
                <h3 class="text-sm font-medium text-yellow-900">Development Environment</h3>
                <p class="text-sm text-yellow-700">This is a simulated customer portal. Changes here won't affect real billing data. Payment method and invoice features are disabled in development.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="max-w-5xl mx-auto px-4 py-8">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <!-- Left Column - Account Overview -->
          <div class="lg:col-span-2 space-y-6">
            
            <!-- Subscription Card -->
            <div class="stripe-card">
              <h2 class="section-title">Subscription</h2>
              ${status === 'canceled' ? `
                <div class="text-center py-8">
                  <svg class="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <h3 class="text-lg font-medium text-gray-900 mb-2">Subscription canceled</h3>
                  <p class="text-gray-600 mb-4">Your subscription has been canceled in the simulation.</p>
                  <div class="flex space-x-3 justify-center">
                    <button onclick="reactivateSubscription()" class="stripe-button">
                      Reactivate subscription
                    </button>
                    <button onclick="window.history.back()" class="stripe-button">
                      Browse plans
                    </button>
                  </div>
                </div>
              ` : currentSubscription || (status === 'current' && currentPriceId) ? `
                <div class="space-y-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="flex items-center space-x-2">
                        <span class="text-2xl font-semibold text-gray-900">${planName}</span>
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      </div>
                      ${subscriptionDate ? `<p class="text-sm text-gray-600 mt-1">Started ${subscriptionDate}</p>` : ''}
                      ${currentPriceId ? `<p class="text-xs text-gray-500 mt-1">Plan ID: ${currentPriceId}</p>` : ''}
                    </div>
                    <div class="text-right">
                      ${planAmount ? `
                        <div class="text-lg font-medium text-gray-900">${formatPrice(planAmount, planCurrency)}</div>
                        ${planInterval ? `<div class="text-sm text-gray-500">per ${planInterval}</div>` : ''}
                      ` : `
                        <div class="text-lg font-medium text-gray-900">Active</div>
                      `}
                    </div>
                  </div>
                  
                  <div class="pt-4 border-t border-gray-200">
                    <div class="flex space-x-3">
                      ${otherPlans.length > 0 ? `
                        <button onclick="showUpgradeModal()" class="stripe-button">
                          Change plan
                        </button>
                      ` : ''}
                      <button onclick="showCancelModal()" class="stripe-button stripe-button-danger">
                        Cancel subscription
                      </button>
                    </div>
                  </div>
                </div>
              ` : `
                <div class="text-center py-8">
                  <svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <h3 class="text-lg font-medium text-gray-900 mb-2">No active subscription</h3>
                  <p class="text-gray-600 mb-4">You don't have an active subscription.</p>
                  <button onclick="window.history.back()" class="stripe-button">
                    Browse plans
                  </button>
                </div>
              `}
            </div>

            <!-- Payment Methods Card -->
            <div class="stripe-card">
              <h2 class="section-title">Payment methods</h2>
              <div class="space-y-4">
                <div class="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <div class="flex-shrink-0">
                    <svg class="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
                    </svg>
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center space-x-2">
                      <span class="text-sm font-medium text-gray-900">•••• •••• •••• 4242</span>
                      <span class="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">VISA</span>
                      <span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Default</span>
                    </div>
                    <p class="text-xs text-gray-500">Expires 12/34</p>
                  </div>
                  <div class="flex-shrink-0">
                    <button class="text-sm text-gray-400 cursor-not-allowed" disabled>
                      Edit
                    </button>
                  </div>
                </div>
                
                <div class="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div class="flex gap-3">
                    <svg class="w-5 h-5 text-yellow-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                    </svg>
                    <div class="text-sm text-yellow-700">
                      Payment method editing is disabled in development mode. This feature will work when your app is published.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Invoice History Card -->
            <div class="stripe-card">
              <h2 class="section-title">Invoice history</h2>
              <div class="space-y-3">
                ${subscriptionDate && planAmount ? `
                  <div class="flex items-center justify-between py-3 border-b border-gray-100">
                    <div class="flex items-center space-x-3">
                      <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                      <div>
                        <div class="text-sm font-medium text-gray-900">${subscriptionDate}</div>
                        <div class="text-xs text-gray-500">${planInterval ? `${planInterval.charAt(0).toUpperCase() + planInterval.slice(1)}ly` : ''} subscription</div>
                      </div>
                    </div>
                    <div class="text-right">
                      <div class="text-sm font-medium text-gray-900">${formatPrice(planAmount, planCurrency)}</div>
                      <button class="text-xs text-blue-600 hover:text-blue-800 cursor-not-allowed" disabled>
                        Download
                      </button>
                    </div>
                  </div>
                ` : `
                  <div class="flex items-center justify-center py-8">
                    <div class="text-sm text-gray-500">No invoices available</div>
                  </div>
                `}
                
                <div class="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div class="text-sm text-gray-600 text-center">
                    Invoice downloads are disabled in development mode.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column - Account Info -->
          <div class="space-y-6">
            
            <!-- Account Information -->
            <div class="stripe-card">
              <h2 class="section-title">Account information</h2>
              <div class="space-y-4">
                <div>
                  <label class="text-xs font-medium text-gray-700 uppercase tracking-wide">Name</label>
                  <div class="mt-1 text-sm text-gray-900">${displayName}</div>
                </div>
                <div>
                  <label class="text-xs font-medium text-gray-700 uppercase tracking-wide">Email</label>
                  <div class="mt-1 text-sm text-gray-900">${email}</div>
                </div>
                <div class="pt-3 border-t border-gray-200">
                  <button class="text-sm text-gray-400 cursor-not-allowed" disabled>
                    Update information
                  </button>
                  <p class="text-xs text-gray-500 mt-1">Account updates are disabled in development mode.</p>
                </div>
              </div>
            </div>

            <!-- App Information -->
            <div class="stripe-card">
              <h2 class="section-title">App information</h2>
              <div class="space-y-2">
                <div>
                  <label class="text-xs font-medium text-gray-700 uppercase tracking-wide">App ID</label>
                  <div class="mt-1 text-sm font-mono text-gray-600">${appId}</div>
                </div>
                <div>
                  <label class="text-xs font-medium text-gray-700 uppercase tracking-wide">Environment</label>
                  <div class="mt-1 text-sm text-gray-600">Development</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Cancel Subscription Modal -->
      <div id="cancelModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
        <div class="bg-white rounded-lg max-w-md w-full mx-4 p-6">
          <div class="flex items-center space-x-3 mb-4">
            <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900">Cancel subscription</h3>
          </div>
          
          <p class="text-sm text-gray-600 mb-6">
            Are you sure you want to cancel your subscription? You'll lose access to premium features at the end of your current billing period.
          </p>
          
          <div class="flex space-x-3">
            <button onclick="hideCancelModal()" class="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
              Keep subscription
            </button>
            <button onclick="cancelSubscription()" class="flex-1 px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700">
              Cancel subscription
            </button>
          </div>
        </div>
      </div>

      <!-- Upgrade Plan Modal -->
      <div id="upgradeModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
        <div class="bg-white rounded-lg max-w-lg w-full mx-4 p-6">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-medium text-gray-900">Change subscription plan</h3>
            <button onclick="hideUpgradeModal()" class="text-gray-400 hover:text-gray-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          
          <div class="space-y-4">
            ${currentPlan ? `
              <div class="border border-blue-200 bg-blue-50 rounded-lg p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="font-medium text-gray-900">${planName}</h4>
                    <p class="text-sm text-gray-600">Current plan</p>
                  </div>
                  <div class="text-right">
                    ${planAmount ? `
                      <div class="font-medium text-gray-900">${formatPrice(planAmount, planCurrency)}</div>
                      ${planInterval ? `<div class="text-sm text-gray-500">per ${planInterval}</div>` : ''}
                    ` : `
                      <div class="font-medium text-gray-900">Active</div>
                    `}
                  </div>
                </div>
              </div>
            ` : ''}
            
            ${otherPlans.map(plan => `
              <div class="border border-gray-200 rounded-lg p-4 hover:border-blue-300 cursor-pointer transition-colors" 
                   onclick="selectPlan('${plan.id}')">
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="font-medium text-gray-900">${plan.product_info?.name || plan.nickname || 'Plan'}</h4>
                    <p class="text-sm text-gray-600">${plan.product_info?.description || 'Subscription plan'}</p>
                  </div>
                  <div class="text-right">
                    <div class="font-medium text-gray-900">${formatPrice(plan.unit_amount || 0, plan.currency)}</div>
                    ${plan.recurring?.interval ? `<div class="text-sm text-gray-500">per ${plan.recurring.interval}</div>` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
            
            ${otherPlans.length === 0 ? `
              <div class="text-center py-8">
                <div class="text-sm text-gray-500">No other plans available</div>
              </div>
            ` : ''}
          </div>
          
          <div class="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div class="text-sm text-yellow-700">
              Plan changes are simulated in development mode and won't affect real billing.
            </div>
          </div>
          
          <div class="flex space-x-3 mt-6">
            <button onclick="hideUpgradeModal()" class="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button id="confirmUpgradeBtn" onclick="confirmUpgrade()" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700" disabled>
              Select a plan first
            </button>
          </div>
        </div>
      </div>

      <script>
        let selectedPlanId = null;

        function showCancelModal() {
          document.getElementById('cancelModal').classList.remove('hidden');
          document.getElementById('cancelModal').classList.add('flex');
        }

        function hideCancelModal() {
          document.getElementById('cancelModal').classList.add('hidden');
          document.getElementById('cancelModal').classList.remove('flex');
        }

        function showUpgradeModal() {
          document.getElementById('upgradeModal').classList.remove('hidden');
          document.getElementById('upgradeModal').classList.add('flex');
          selectedPlanId = null;
          updateUpgradeButton();
        }

        function hideUpgradeModal() {
          document.getElementById('upgradeModal').classList.add('hidden');
          document.getElementById('upgradeModal').classList.remove('flex');
          selectedPlanId = null;
        }

        function selectPlan(planId) {
          // Remove previous selection
          document.querySelectorAll('[onclick^="selectPlan"]').forEach(el => {
            el.classList.remove('border-blue-400', 'bg-blue-50');
            el.classList.add('border-gray-200');
          });
          
          // Add selection to clicked plan
          event.currentTarget.classList.remove('border-gray-200');
          event.currentTarget.classList.add('border-blue-400', 'bg-blue-50');
          
          selectedPlanId = planId;
          updateUpgradeButton();
        }

        function updateUpgradeButton() {
          const btn = document.getElementById('confirmUpgradeBtn');
          if (selectedPlanId) {
            btn.disabled = false;
            btn.textContent = 'Change to selected plan';
            btn.classList.remove('bg-gray-400');
            btn.classList.add('bg-blue-600', 'hover:bg-blue-700');
          } else {
            btn.disabled = true;
            btn.textContent = 'Select a plan first';
            btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            btn.classList.add('bg-gray-400');
          }
        }

        async function cancelSubscription() {
          const button = event.target;
          const originalText = button.textContent;
          
          try {
            button.disabled = true;
            button.textContent = 'Canceling...';
            
            const response = await fetch(\`/apps/${appId}/stripe/simulate/cancel\`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include'
            });
            
            if (!response.ok) {
              throw new Error('Cancellation failed');
            }
            
            const result = await response.json();
            
            if (result.success) {
              button.textContent = '✓ Canceled';
              button.style.backgroundColor = '#10b981';
              
              console.log('Cancellation successful, redirecting to app in 1000ms');
              console.log('Cookie should now be set to canceled status');
              
              setTimeout(() => {
                // Get the return URL from the query parameters or use referrer
                const urlParams = new URLSearchParams(window.location.search);
                let returnUrl = urlParams.get('returnUrl');
                
                if (!returnUrl) {
                  const referrer = document.referrer;
                  if (referrer) {
                    const referrerUrl = new URL(referrer);
                    returnUrl = referrerUrl.origin + '/preview/';
                  } else {
                    // Fallback based on current domain
                    if (window.location.hostname === 'localhost') {
                      returnUrl = 'http://localhost:3100/preview/';
                    } else if (window.location.hostname.includes('fly.dev')) {
                      returnUrl = \`https://manifest-app-\${appId}.fly.dev/preview/\`;
                    } else {
                      returnUrl = \`https://\${appId}.sites.madewithmanifest.com/\`;
                    }
                  }
                }
                
                // Add cache-busting parameter to force refresh
                const separator = returnUrl.includes('?') ? '&' : '?';
                returnUrl += \`\${separator}billing_refresh=\${Date.now()}\`;
                
                window.location.href = returnUrl;
              }, 1000);
            }
            
          } catch (error) {
            console.error('Cancellation error:', error);
            button.disabled = false;
            button.textContent = originalText;
            alert('Cancellation failed. Please try again.');
          }
        }

        async function confirmUpgrade() {
          if (!selectedPlanId) return;
          
          const button = event.target;
          const originalText = button.textContent;
          
          try {
            button.disabled = true;
            button.textContent = 'Upgrading...';
            
            const response = await fetch(\`/apps/${appId}/stripe/simulate/upgrade\`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({ newPriceId: selectedPlanId })
            });
            
            if (!response.ok) {
              throw new Error('Upgrade failed');
            }
            
            const result = await response.json();
            
            if (result.success) {
              button.textContent = '✓ Plan Changed';
              button.style.backgroundColor = '#10b981';
              
              setTimeout(() => {
                hideUpgradeModal();
                window.location.reload();
              }, 1000);
            }
            
          } catch (error) {
            console.error('Upgrade error:', error);
            button.disabled = false;
            button.textContent = originalText;
            alert('Plan change failed. Please try again.');
          }
        }

        async function reactivateSubscription() {
          const button = event.target;
          const originalText = button.textContent;
          
          try {
            button.disabled = true;
            button.textContent = 'Reactivating...';
            
            // Clear the canceled simulation cookie to restore previous state
            const response = await fetch(\`/apps/${appId}/stripe/simulate/reactivate\`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include'
            });
            
            if (!response.ok) {
              throw new Error('Reactivation failed');
            }
            
            const result = await response.json();
            
            if (result.success) {
              button.textContent = '✓ Reactivated';
              button.style.backgroundColor = '#10b981';
              
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            }
            
          } catch (error) {
            console.error('Reactivation error:', error);
            button.disabled = false;
            button.textContent = originalText;
            alert('Reactivation failed. Please try again.');
          }
        }

        // Close modals when clicking outside
        document.getElementById('cancelModal').addEventListener('click', function(e) {
          if (e.target === this) {
            hideCancelModal();
          }
        });

        document.getElementById('upgradeModal').addEventListener('click', function(e) {
          if (e.target === this) {
            hideUpgradeModal();
          }
        });
      </script>
    </body>
    </html>
  `;
}

module.exports = {
  getPortalSimulationHTML
};