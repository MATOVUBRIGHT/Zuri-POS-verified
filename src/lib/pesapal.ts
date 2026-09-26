// Pesapal Integration Service
export interface PesapalConfig {
  consumerKey: string;
  consumerSecret: string;
  environment: 'sandbox' | 'production';
}

export interface PesapalInvoiceRequest {
  id: string;
  amount: number;
  currency: string;
  description: string;
  callback_url: string;
  redirect_mode: string;
  notification_id: string;
  billing_address: {
    email_address: string;
    phone_number: string;
    country_code: string;
    first_name: string;
    last_name: string;
  };
}

export interface PesapalPaymentResponse {
  order_tracking_id: string;
  merchant_reference: string;
  redirect_url: string;
}

export interface PesapalTransactionStatus {
  payment_status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  payment_method: string;
  transaction_amount: number;
  transaction_currency: string;
  merchant_reference: string;
  order_tracking_id: string;
  payment_account: string;
  payment_date: string;
}

class PesapalService {
  private config: PesapalConfig | null = null;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  setConfig(config: PesapalConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    if (!this.config) throw new Error('Pesapal config not set');
    return this.config.environment === 'production' 
      ? 'https://pay.pesapal.com/v3' 
      : 'https://cybqa.pesapal.com/pesapalv3';
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.config) throw new Error('Pesapal config not set');

    const credentials = btoa(`${this.config.consumerKey}:${this.config.consumerSecret}`);
    
    try {
      const response = await fetch(`${this.getBaseUrl()}/api/Auth/RequestToken`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 minute before expiry
      
      return this.accessToken;
    } catch (error) {
      console.error('Error getting Pesapal access token:', error);
      throw error;
    }
  }

  async submitInvoice(invoiceRequest: PesapalInvoiceRequest): Promise<PesapalPaymentResponse> {
    try {
      const token = await this.getAccessToken();
      
      const response = await fetch(`${this.getBaseUrl()}/api/Transactions/SubmitOrderRequest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(invoiceRequest)
      });

      if (!response.ok) {
        throw new Error(`Failed to submit invoice: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error submitting Pesapal invoice:', error);
      throw error;
    }
  }

  async getTransactionStatus(orderTrackingId: string): Promise<PesapalTransactionStatus> {
    try {
      const token = await this.getAccessToken();
      
      const response = await fetch(`${this.getBaseUrl()}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get transaction status: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting Pesapal transaction status:', error);
      throw error;
    }
  }

  generateInvoiceData(sale: any, customerEmail?: string, customerPhone?: string): PesapalInvoiceRequest {
    return {
      id: sale.id,
      amount: sale.totalAmount,
      currency: 'UGX',
      description: `Payment for ${sale.products.length} product(s) - ${sale.customerName}`,
      callback_url: `${window.location.origin}/payment-callback`,
      redirect_mode: '',
      notification_id: sale.id,
      billing_address: {
        email_address: customerEmail || 'customer@example.com',
        phone_number: customerPhone || '+256000000000',
        country_code: 'UG',
        first_name: sale.customerName.split(' ')[0] || 'Customer',
        last_name: sale.customerName.split(' ').slice(1).join(' ') || 'Name'
      }
    };
  }

  async processPayment(sale: any, customerEmail?: string, customerPhone?: string): Promise<string> {
    try {
      const invoiceData = this.generateInvoiceData(sale, customerEmail, customerPhone);
      const response = await this.submitInvoice(invoiceData);
      
      // Store the order tracking ID for later status checking
      localStorage.setItem(`pesapal_order_${sale.id}`, response.order_tracking_id);
      
      return response.redirect_url;
    } catch (error) {
      console.error('Error processing Pesapal payment:', error);
      throw error;
    }
  }
}

export const pesapalService = new PesapalService();

// Utility function to format payment method display
export const formatPaymentMethod = (method: string): string => {
  const methodLower = method.toLowerCase();
  
  if (methodLower.includes('pesapal')) return 'Pesapal';
  if (methodLower.includes('mtn') || methodLower.includes('mobile money')) return 'Mobile Money (MTN)';
  if (methodLower.includes('airtel')) return 'Mobile Money (Airtel)';
  if (methodLower.includes('bank')) return 'Bank Transfer';
  if (methodLower.includes('card') || methodLower.includes('credit') || methodLower.includes('debit')) return 'Card Payment';
  if (methodLower.includes('cash')) return 'Cash';
  
  return method;
};

// Utility function to get payment method icon color
export const getPaymentMethodColor = (method: string): string => {
  const methodLower = method.toLowerCase();
  
  if (methodLower.includes('pesapal')) return 'text-purple-600 bg-purple-100';
  if (methodLower.includes('mtn') || methodLower.includes('mobile money')) return 'text-yellow-600 bg-yellow-100';
  if (methodLower.includes('airtel')) return 'text-red-600 bg-red-100';
  if (methodLower.includes('bank')) return 'text-green-600 bg-green-100';
  if (methodLower.includes('card') || methodLower.includes('credit') || methodLower.includes('debit')) return 'text-blue-600 bg-blue-100';
  if (methodLower.includes('cash')) return 'text-gray-600 bg-gray-100';
  
  return 'text-gray-600 bg-gray-100';
};
