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
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background-color: #f4f5f8;
          height: 100vh;
          display: flex;
        }
        
        /* Left Panel */
        .left-panel {
          flex: 0 0 40%;
          background-color: #f4f5f8;
          padding: 64px;
          height: 100vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        
        /* Right Panel */
        .right-panel {
          flex: 0 0 60%;
          background-color: white;
          padding: 64px;
          height: 100vh;
          overflow-y: auto;
          box-shadow: rgba(0, 0, 0, 0.18) 15px 0px 30px 0px;
        }
        
        /* Header */
        .header {
          display: flex;
          align-items: center;
          margin-bottom: 48px;
        }
        
        .avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .business-name {
          font-size: 16px;
          font-weight: 500;
          color: #1a1f36;
          margin-right: 12px;
        }
        
        .test-badge {
          background: #fef3c7;
          color: #92400e;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }
        
        .tagline {
          font-size: 24px;
          font-weight: 500;
          color: #1a1f36;
          line-height: 1.3;
          max-width: 240px;
          margin-bottom: 32px;
        }
        
        .return-link {
          display: flex;
          align-items: center;
          color: #1a1f36;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
        }
        
        .return-link:hover {
          color: #374151;
        }
        
        .return-link svg {
          margin-right: 8px;
        }
        
        /* Footer */
        .footer {
          opacity: 0.6;
        }
        
        .powered-by {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .powered-by span {
          font-size: 12px;
          color: #1a1f36;
          margin-right: 8px;
        }
        
        .legal-links {
          display: flex;
          gap: 16px;
        }
        
        .legal-links a {
          font-size: 12px;
          color: #1a1f36;
          text-decoration: none;
        }
        
        /* Section Headers */
        .section-header {
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 16px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .section-title {
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }
        
        .section {
          margin-bottom: 64px;
        }
        
        /* Subscription Section */
        .subscription-info {
          margin-bottom: 16px;
        }
        
        .plan-name {
          font-size: 20px;
          font-weight: 500;
          color: #1a1f36;
          margin-bottom: 4px;
        }
        
        .plan-price {
          font-size: 24px;
          font-weight: 700;
          color: #1a1f36;
          margin-bottom: 12px;
        }
        
        .plan-details {
          font-size: 14px;
          color: #374151;
          margin-bottom: 16px;
        }
        
        .payment-method {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
        }
        
        .card-icon {
          width: 20px;
          height: 20px;
          margin-right: 8px;
          background: white;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .card-info {
          font-size: 16px;
          color: #1a1f36;
        }
        
        .cancel-button {
          background: white;
          border: 1px solid #d1d5db;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          text-decoration: none;
          display: inline-block;
        }
        
        .cancel-button:hover {
          background: #f9fafb;
        }
        
        /* Payment Method Section */
        .payment-method-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }
        
        .payment-left {
          display: flex;
          align-items: center;
        }
        
        .payment-right {
          font-size: 16px;
          color: #1a1f36;
        }
        
        .add-payment {
          display: flex;
          align-items: center;
          color: #6b7280;
          text-decoration: none;
          font-size: 16px;
          font-weight: 500;
          cursor: not-allowed;
        }
        
        .add-payment:hover {
          color: #374151;
        }
        
        .add-payment svg {
          margin-right: 8px;
        }
        
        /* Billing Info Section */
        .billing-row {
          display: flex;
          margin-bottom: 24px;
        }
        
        .billing-label {
          flex: 0 0 160px;
          font-size: 16px;
          color: #6b7280;
          padding-right: 8px;
        }
        
        .billing-value {
          font-size: 16px;
          color: #1a1f36;
          max-width: 80%;
        }
        
        .edit-button {
          display: flex;
          align-items: center;
          color: #6b7280;
          text-decoration: none;
          font-size: 16px;
          font-weight: 500;
          cursor: not-allowed;
        }
        
        .edit-button:hover {
          color: #374151;
        }
        
        .edit-button svg {
          margin-right: 8px;
        }
        
        /* Invoice Section */
        .invoice-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid #f3f4f6;
        }
        
        .invoice-left {
          display: flex;
          align-items: center;
        }
        
        .invoice-status {
          width: 8px;
          height: 8px;
          background: #10b981;
          border-radius: 50%;
          margin-right: 12px;
        }
        
        .invoice-date {
          font-size: 14px;
          font-weight: 500;
          color: #1a1f36;
        }
        
        .invoice-desc {
          font-size: 12px;
          color: #6b7280;
        }
        
        .invoice-right {
          text-align: right;
        }
        
        .invoice-amount {
          font-size: 14px;
          font-weight: 500;
          color: #1a1f36;
        }
        
        .invoice-download {
          font-size: 12px;
          color: #3b82f6;
          text-decoration: none;
        }
        
        .invoice-download:hover {
          color: #1d4ed8;
        }
        
        /* Dev Notice */
        .dev-notice {
          background: #fef3c7;
          border: 1px solid #f59e0b;
          border-radius: 6px;
          padding: 12px;
          font-size: 14px;
          color: #92400e;
          margin: 16px 0;
        }
        
        /* Modal Styles */
        .modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: none !important;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        
        .modal.show {
          display: flex !important;
        }
        
        .modal-content {
          background: white;
          border-radius: 8px;
          padding: 24px;
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
        }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        
        .modal-title {
          font-size: 18px;
          font-weight: 600;
          color: #1a1f36;
        }
        
        .close-button {
          background: none;
          border: none;
          font-size: 24px;
          color: #6b7280;
          cursor: pointer;
        }
        
        .modal-body {
          margin-bottom: 24px;
        }
        
        .modal-footer {
          display: flex;
          gap: 12px;
        }
        
        .btn {
          padding: 12px 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          flex: 1;
        }
        
        .btn-primary {
          background: #3b82f6;
          color: white;
        }
        
        .btn-primary:hover {
          background: #2563eb;
        }
        
        .btn-secondary {
          background: #f3f4f6;
          color: #374151;
          border: 1px solid #d1d5db;
        }
        
        .btn-secondary:hover {
          background: #e5e7eb;
        }
        
        .btn-danger {
          background: #dc2626;
          color: white;
        }
        
        .btn-danger:hover {
          background: #b91c1c;
        }
        
        .plan-option {
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .plan-option:hover {
          border-color: #3b82f6;
        }
        
        .plan-option.selected {
          border-color: #3b82f6;
          background: #eff6ff;
        }
        
        .plan-option-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .plan-option-name {
          font-weight: 500;
          color: #1a1f36;
        }
        
        .plan-option-price {
          font-weight: 500;
          color: #1a1f36;
        }
        
        .plan-option-desc {
          font-size: 14px;
          color: #6b7280;
          margin-top: 4px;
        }
        
        .current-plan {
          background: #eff6ff;
          border-color: #3b82f6;
        }
        
        .current-plan-label {
          font-size: 14px;
          color: #3b82f6;
        }
        
        .no-subscription {
          text-align: center;
          padding: 48px 24px;
        }
        
        .no-subscription svg {
          width: 48px;
          height: 48px;
          color: #dc2626;
          margin: 0 auto 16px;
        }
        
        .no-subscription h3 {
          font-size: 18px;
          font-weight: 500;
          color: #1a1f36;
          margin-bottom: 8px;
        }
        
        .no-subscription p {
          color: #6b7280;
          margin-bottom: 24px;
        }
        
        .no-subscription .btn-group {
          display: flex;
          gap: 12px;
          justify-content: center;
        }
      </style>
    </head>
    <body>
      <!-- Main Container -->
      <div style="display: flex; height: 100vh; width: 100%;">
        
        <!-- Left Panel -->
        <div class="left-panel">
          <div>
            <!-- Header -->
            <div class="header">
              <div class="avatar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="#6b7280">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M14.998 8.19A2.908 2.908 0 0 0 16 6v-.1c0-.316-.031-.631-.094-.94l-.63-3.12-.003-.012c-.124-.524-.35-1.013-.774-1.36C14.07.118 13.545 0 13 0H3c-.545 0-1.07.119-1.499.468-.425.347-.65.835-.774 1.36l-.003.012-.63 3.12A4.75 4.75 0 0 0 0 5.9V6c0 .88.39 1.65 1.002 2.191A.76.76 0 0 0 1 8.25v5.5A2.25 2.25 0 0 0 3.25 16h9.5A2.25 2.25 0 0 0 15 13.75v-5.5c0-.02 0-.04-.002-.06Z"/>
                </svg>
              </div>
              <span class="business-name">${displayName}</span>
              <span class="test-badge">Test mode</span>
            </div>
            
            <div style="margin-top: 48px;">
              <div class="tagline">${displayName} partners with Stripe for simplified billing.</div>
              <a href="#" onclick="window.history.back()" class="return-link">
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M4.72.97a.75.75 0 0 1 1.06 1.06L2.56 5.25h8.69a.75.75 0 0 1 0 1.5H2.56l3.22 3.22a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.748.748 0 0 1 0-1.06l4.5-4.5Z" fill="currentColor"/>
                </svg>
                Return to ${displayName}
              </a>
            </div>
          </div>
          
          <!-- Footer -->
          <div class="footer">
            <div class="powered-by">
              <span>Powered by</span>
              <svg width="38" height="16" viewBox="0 0 360 150">
                <path fill="#1a1f36" fill-rule="evenodd" d="M360 77.4c0 2.4-.2 7.6-.2 8.9h-48.9c1.1 11.8 9.7 15.2 19.4 15.2 9.9 0 17.7-2.1 24.5-5.5v20c-6.8 3.8-15.8 6.5-27.7 6.5-24.4 0-41.4-15.2-41.4-45.3 0-25.4 14.4-45.6 38.2-45.6 23.7 0 36.1 20.2 36.1 45.8zm-49.4-9.5h25.8c0-11.3-6.5-16-12.6-16-6.3 0-13.2 4.7-13.2 16zm-63.5-36.3c17.5 0 34 15.8 34.1 44.8 0 31.7-16.3 46.1-34.2 46.1-8.8 0-14.1-3.7-17.7-6.3l-.1 28.3-25 5.3V33.2h22l1.3 6.2c3.5-3.2 9.8-7.8 19.6-7.8zm-6 68.9c9.2 0 15.4-10 15.4-23.4 0-13.1-6.3-23.3-15.4-23.3-5.7 0-9.3 2-11.9 4.9l.1 37.1c2.4 2.6 5.9 4.7 11.8 4.7zm-71.3-74.8V5.3L194.9 0v20.3l-25.1 5.4zm0 7.6h25.1v87.5h-25.1V33.3zm-26.9 7.4c5.9-10.8 17.6-8.6 20.8-7.4v23c-3.1-1.1-13.1-2.5-19 5.2v59.3h-25V33.3h21.6l1.6 7.4zm-50-29.1l-.1 21.7h19v21.3h-19v35.5c0 14.8 15.8 10.2 19 8.9v20.3c-3.3 1.8-9.3 3.3-17.5 3.3-14.8 0-25.9-10.9-25.9-25.7l.1-80.1 24.4-5.2zM25.3 58.7c0 11.2 38.1 5.9 38.2 35.7 0 17.9-14.3 28.2-35.1 28.2-8.6 0-18-1.7-27.3-5.7V93.1c8.4 4.6 19 8 27.3 8 5.6 0 9.6-1.5 9.6-6.1 0-11.9-38-7.5-38-35.1 0-17.7 13.5-28.3 33.8-28.3 8.3 0 16.5 1.3 24.8 4.6v23.5c-7.6-4.1-17.2-6.4-24.8-6.4-5.3 0-8.5 1.5-8.5 5.4z"/>
              </svg>
            </div>
            <div class="legal-links">
              <a href="https://stripe.com/terms" target="_blank">Terms</a>
              <a href="https://stripe.com/privacy" target="_blank">Privacy</a>
            </div>
          </div>
        </div>
        
        <!-- Right Panel -->
        <div class="right-panel">
          <div style="min-height: 100px; padding-top: 4px;"></div>
          
          <!-- Current Subscription Section -->
          <div class="section">
            <div class="section-header">
              <div class="section-title">Current subscription</div>
            </div>
            
            ${status === 'canceled' ? `
              <div class="no-subscription">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <h3>Subscription canceled</h3>
                <p>Your subscription has been canceled in the simulation.</p>
                <div class="btn-group">
                  <button onclick="reactivateSubscription()" class="btn btn-primary">Reactivate subscription</button>
                  <button onclick="window.history.back()" class="btn btn-secondary">Browse plans</button>
                </div>
              </div>
            ` : currentSubscription || (status === 'current' && currentPriceId) ? `
              <div class="subscription-info">
                <div class="plan-name">${planName}</div>
                <div class="plan-price">${planAmount ? formatPrice(planAmount, planCurrency) : 'Active'} ${planInterval ? `per ${planInterval}` : ''}</div>
                ${subscriptionDate ? `<div class="plan-details">Your subscription renews on ${subscriptionDate}.</div>` : ''}
                
                <div class="payment-method">
                  <div class="card-icon">
                    <svg width="20" height="20" viewBox="0 0 32 32">
                      <g fill="none" fill-rule="evenodd">
                        <path d="M0 0h32v32H0z" fill="#00579f"/>
                        <g fill="#fff" fill-rule="nonzero">
                          <path d="M13.823 19.876H11.8l1.265-7.736h2.023zm7.334-7.546a5.036 5.036 0 0 0-1.814-.33c-1.998 0-3.405 1.053-3.414 2.56-.016 1.11 1.007 1.728 1.773 2.098.783.379 1.05.626 1.05.963-.009.518-.633.757-1.216.757-.808 0-1.24-.123-1.898-.411l-.267-.124-.283 1.737c.475.213 1.349.403 2.257.411 2.123 0 3.505-1.037 3.521-2.641.008-.881-.532-1.556-1.698-2.107-.708-.354-1.141-.593-1.141-.955.008-.33.366-.667 1.165-.667a3.471 3.471 0 0 1 1.507.297l.183.082zm2.69 4.806.807-2.165c-.008.017.167-.452.266-.74l.142.666s.383 1.852.466 2.239h-1.682zm2.497-4.996h-1.565c-.483 0-.85.14-1.058.642l-3.005 7.094h2.123l.425-1.16h2.597c.059.271.242 1.16.242 1.16h1.873zm-16.234 0-1.982 5.275-.216-1.07c-.366-1.234-1.515-2.575-2.797-3.242l1.815 6.765h2.14l3.18-7.728z"/>
                        </g>
                      </g>
                    </svg>
                  </div>
                  <span class="card-info">Visa •••• 4242</span>
                </div>
                
                <button onclick="showCancelModal()" class="cancel-button">Cancel subscription</button>
              </div>
            ` : `
              <div class="no-subscription">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <h3>No active subscription</h3>
                <p>You don't have an active subscription.</p>
                <div class="btn-group">
                  <button onclick="window.history.back()" class="btn btn-primary">Browse plans</button>
                </div>
              </div>
            `}
          </div>
          
          <!-- Payment Method Section -->
          <div class="section">
            <div class="section-header">
              <div class="section-title">Payment method</div>
            </div>
            
            <div class="payment-method-card">
              <div class="payment-left">
                <div class="card-icon">
                  <svg width="24" height="24" viewBox="0 0 32 32">
                    <g fill="none" fill-rule="evenodd">
                      <path d="M0 0h32v32H0z" fill="#00579f"/>
                      <g fill="#fff" fill-rule="nonzero">
                        <path d="M13.823 19.876H11.8l1.265-7.736h2.023zm7.334-7.546a5.036 5.036 0 0 0-1.814-.33c-1.998 0-3.405 1.053-3.414 2.56-.016 1.11 1.007 1.728 1.773 2.098.783.379 1.05.626 1.05.963-.009.518-.633.757-1.216.757-.808 0-1.24-.123-1.898-.411l-.267-.124-.283 1.737c.475.213 1.349.403 2.257.411 2.123 0 3.505-1.037 3.521-2.641.008-.881-.532-1.556-1.698-2.107-.708-.354-1.141-.593-1.141-.955.008-.33.366-.667 1.165-.667a3.471 3.471 0 0 1 1.507.297l.183.082zm2.69 4.806.807-2.165c-.008.017.167-.452.266-.74l.142.666s.383 1.852.466 2.239h-1.682zm2.497-4.996h-1.565c-.483 0-.85.14-1.058.642l-3.005 7.094h2.123l.425-1.16h2.597c.059.271.242 1.16.242 1.16h1.873zm-16.234 0-1.982 5.275-.216-1.07c-.366-1.234-1.515-2.575-2.797-3.242l1.815 6.765h2.14l3.18-7.728z"/>
                      </g>
                    </g>
                  </svg>
                </div>
                <span class="card-info">Visa •••• 4242</span>
              </div>
              <div class="payment-right">Expires 04/2032</div>
            </div>
            
            <a href="#" class="add-payment">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M8 .25c.483 0 .875.392.875.875v6h6a.875.875 0 0 1 0 1.75h-6v6a.875.875 0 0 1-1.75 0v-6h-6a.875.875 0 1 1 0-1.75h6v-6c0-.483.392-.875.875-.875Z"/>
              </svg>
              Add payment method
            </a>
            
            <div class="dev-notice">
              Payment method editing is disabled in development mode. This feature will work when your app is published.
            </div>
          </div>
          
          <!-- Billing Information Section -->
          <div class="section">
            <div class="section-header">
              <div class="section-title">Billing information</div>
            </div>
            
            <div class="billing-row">
              <div class="billing-label">Name</div>
              <div class="billing-value">${displayName}</div>
            </div>
            
            <div class="billing-row">
              <div class="billing-label">Email</div>
              <div class="billing-value">${email}</div>
            </div>
            
            <div class="billing-row">
              <div class="billing-label">Billing address</div>
              <div class="billing-value">
                <address style="font-style: normal;">
                  49426 US
                </address>
              </div>
            </div>
            
            <a href="#" class="edit-button">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M3.75 2.5c-.69 0-1.25.56-1.25 1.25v8.5c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V8.694a.75.75 0 0 1 1.5 0v3.556A2.75 2.75 0 0 1 12.25 15h-8.5A2.75 2.75 0 0 1 1 12.25v-8.5A2.75 2.75 0 0 1 3.75 1h3.556a.75.75 0 1 1 0 1.5H3.75Z"/>
                <path fill-rule="evenodd" clip-rule="evenodd" d="M13.739 1.178a1.75 1.75 0 0 0-2.478.002l-6.05 6.073a.75.75 0 0 0-.2.361l-.742 3.217a.75.75 0 0 0 .9.9l3.217-.743a.75.75 0 0 0 .363-.201l6.053-6.076a1.75 1.75 0 0 0-.003-2.472l-1.06-1.06ZM12.323 2.24a.25.25 0 0 1 .354 0l1.06 1.06a.25.25 0 0 1 0 .354l-.745.749-1.415-1.415.746-.748ZM10.52 4.05 6.425 8.16 6.001 10l1.837-.425 4.096-4.11L10.52 4.05Z"/>
              </svg>
              Update information
            </a>
            
            <div class="dev-notice">
              Billing information editing is disabled in development mode. This feature will work when your app is published.
            </div>
          </div>
          
          <!-- Invoice History Section -->
          <div class="section">
            <div class="section-header">
              <div class="section-title">Invoice history</div>
              <div>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="#6b7280">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M7.883 9.085a5 5 0 1 1 1.202-1.202l2.666 2.666a.847.847 0 0 1 0 1.202.847.847 0 0 1-1.202 0L7.883 9.085ZM8.3 5a3.3 3.3 0 1 1-6.6 0 3.3 3.3 0 0 1 6.6 0Z"/>
                </svg>
              </div>
            </div>
            
            ${subscriptionDate && planAmount ? `
              <div class="invoice-item">
                <div class="invoice-left">
                  <div class="invoice-status"></div>
                  <div>
                    <div class="invoice-date">${subscriptionDate}</div>
                    <div class="invoice-desc">${planInterval ? `${planInterval.charAt(0).toUpperCase() + planInterval.slice(1)}ly` : ''} subscription</div>
                  </div>
                </div>
                <div class="invoice-right">
                  <div class="invoice-amount">${formatPrice(planAmount, planCurrency)}</div>
                  <a href="#" class="invoice-download">Download</a>
                </div>
              </div>
            ` : `
              <div style="text-align: center; padding: 32px; color: #6b7280;">
                No invoices available
              </div>
            `}
            
            <div class="dev-notice">
              Invoice downloads are disabled in development mode.
            </div>
          </div>
        </div>
      </div>

      <!-- Cancel Subscription Modal -->
      <div id="cancelModal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">Cancel subscription</div>
            <button onclick="hideCancelModal()" class="close-button">×</button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to cancel your subscription? You'll lose access to premium features at the end of your current billing period.</p>
          </div>
          <div class="modal-footer">
            <button onclick="hideCancelModal()" class="btn btn-secondary">Keep subscription</button>
            <button onclick="cancelSubscription()" class="btn btn-danger">Cancel subscription</button>
          </div>
        </div>
      </div>

      <!-- Upgrade Plan Modal -->
      <div id="upgradeModal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-title">Change subscription plan</div>
            <button onclick="hideUpgradeModal()" class="close-button">×</button>
          </div>
          <div class="modal-body">
            ${currentPlan ? `
              <div class="plan-option current-plan">
                <div class="plan-option-header">
                  <div>
                    <div class="plan-option-name">${planName}</div>
                    <div class="current-plan-label">Current plan</div>
                  </div>
                  <div class="plan-option-price">${planAmount ? formatPrice(planAmount, planCurrency) : 'Active'}</div>
                </div>
              </div>
            ` : ''}
            
            ${otherPlans.map(plan => `
              <div class="plan-option" onclick="selectPlan('${plan.id}')">
                <div class="plan-option-header">
                  <div>
                    <div class="plan-option-name">${plan.product_info?.name || plan.nickname || 'Plan'}</div>
                    <div class="plan-option-desc">${plan.product_info?.description || 'Subscription plan'}</div>
                  </div>
                  <div class="plan-option-price">${formatPrice(plan.unit_amount || 0, plan.currency)}</div>
                </div>
              </div>
            `).join('')}
            
            ${otherPlans.length === 0 ? `
              <div style="text-align: center; padding: 32px; color: #6b7280;">
                No other plans available
              </div>
            ` : ''}
            
            <div class="dev-notice">
              Plan changes are simulated in development mode and won't affect real billing.
            </div>
          </div>
          <div class="modal-footer">
            <button onclick="hideUpgradeModal()" class="btn btn-secondary">Cancel</button>
            <button id="confirmUpgradeBtn" onclick="confirmUpgrade()" class="btn btn-primary" disabled>Select a plan first</button>
          </div>
        </div>
      </div>

      <script>
        let selectedPlanId = null;

        function showCancelModal() {
          document.getElementById('cancelModal').classList.add('show');
        }

        function hideCancelModal() {
          document.getElementById('cancelModal').classList.remove('show');
        }

        function showUpgradeModal() {
          document.getElementById('upgradeModal').classList.add('show');
          selectedPlanId = null;
          updateUpgradeButton();
        }

        function hideUpgradeModal() {
          document.getElementById('upgradeModal').classList.remove('show');
          selectedPlanId = null;
        }

        function selectPlan(planId) {
          // Remove previous selection
          document.querySelectorAll('.plan-option:not(.current-plan)').forEach(el => {
            el.classList.remove('selected');
          });
          
          // Add selection to clicked plan
          event.currentTarget.classList.add('selected');
          
          selectedPlanId = planId;
          updateUpgradeButton();
        }

        function updateUpgradeButton() {
          const btn = document.getElementById('confirmUpgradeBtn');
          if (selectedPlanId) {
            btn.disabled = false;
            btn.textContent = 'Change to selected plan';
          } else {
            btn.disabled = true;
            btn.textContent = 'Select a plan first';
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
        document.addEventListener('click', function(e) {
          if (e.target.classList.contains('modal')) {
            e.target.classList.remove('show');
          }
        });
      </script>
              </svg>
            </div>
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