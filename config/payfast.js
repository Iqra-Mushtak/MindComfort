const crypto = require('crypto');

const PAYFAST_URLS = {
    sandbox: {
        process: 'https://sandbox.payfast.co.za/eng/process',
        validate: 'https://sandbox.payfast.co.za/eng/query/validate'
    },
    production: {
        process: 'https://www.payfast.co.za/eng/process',
        validate: 'https://www.payfast.co.za/eng/query/validate'
    }
};

const PAYFAST_IPS = [
    '196.4.160.84', '196.4.160.85', '196.4.160.86', '196.4.160.87', '41.72.131.10'
];

const isTestMode = process.env.PAYFAST_SANDBOX === 'true';
const getUrls = () => isTestMode ? PAYFAST_URLS.sandbox : PAYFAST_URLS.production;

const isValidPayFastIP = (ip) => {
    if (isTestMode && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('ngrok'))) {
        return true;
    }
    return PAYFAST_IPS.includes(ip);
};

const PAYFAST_PARAM_ORDER = [
  'merchant_id', 'merchant_key', 'return_url', 'cancel_url', 'notify_url',
  'name_first', 'name_last', 'email_address', 'cell_number', 'amount',
  'item_name', 'item_description', 'custom_int1', 'custom_int2', 'custom_int3',
  'custom_int4', 'custom_int5', 'custom_str1', 'custom_str2', 'custom_str3',
  'custom_str4', 'custom_str5', 'email_confirmation', 'confirmation_address',
  'payment_method', 'subscription_type', 'billing_date', 'recurring_amount',
  'frequency', 'cycles'
];

const generateSignature = (data) => {
  let paramString = '';

  for (const key of PAYFAST_PARAM_ORDER) {
    if (data[key] !== undefined && data[key] !== null && String(data[key]).trim() !== '') {
      let value = encodeURIComponent(String(data[key]).trim())
        .replace(/%20/g, '+')
        .replace(/%[0-9a-f]{2}/g, (match) => match.toUpperCase());
      paramString += `${key}=${value}&`;
    }
  }

  paramString = paramString.slice(0, -1);

  return crypto.createHash('md5').update(paramString).digest('hex');
};

const verifySignature = (data, submittedSignature) => {
  try {
    const { signature, pf_signature, ...cleanData } = data;
    const sortedKeys = Object.keys(cleanData).sort();
    
    let paramString = '';
    for (const key of sortedKeys) {
      const value = String(cleanData[key]).trim();
      
      if (value !== '') {
        const encodedValue = encodeURIComponent(value)
          .replace(/%20/g, '+')
          .replace(/%[0-9a-f]{2}/g, (match) => match.toUpperCase());
        paramString += `${key}=${encodedValue}&`;
      }
    }
    
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY || '';
    paramString += `merchant-key=${merchantKey}`;
    
    const localSignature = crypto.createHash('md5').update(paramString).digest('hex');
    
    console.log('ITN signature verification:');
    console.log('String being hashed:', paramString);
    console.log('Local MD5:', localSignature);
    console.log('Submitted MD5:', submittedSignature);
    console.log('Match:', localSignature === submittedSignature);
    
    return localSignature === submittedSignature;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};

module.exports = { generateSignature, verifySignature, getUrls, isTestMode, isValidPayFastIP, crypto };