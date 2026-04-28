const axios = require('axios');

const apiKey = 'sk_4ef38f82500e49f3ad5b5f79595efbe6';
const apiUrl = 'https://api.pagar.me/core/v5/orders';

const payload = {
  items: [{
    amount: 500,
    description: "Doação App Cristão",
    quantity: 1
  }],
  customer: {
    name: "Teste",
    email: "teste@teste.com"
  },
  payments: [{
    payment_method: "pix",
    pix: {
      expires_in: 3600,
      additional_information: [
        { name: "Causa", value: "Divulgação" }
      ]
    }
  }]
};

axios.post(apiUrl, payload, {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`
  }
})
.then(response => {
  const pixPayment = response.data.payments?.find(p => p.payment_method === "pix");
  if (pixPayment?.pix_qr_code) {
    console.log("✅ QR Code PIX gerado:");
    console.log(pixPayment.pix_qr_code);
    console.log("ID da transação:", response.data.id);
  } else {
    console.log("⚠️ Resposta da API não contém QR Code:", response.data);
  }
})
.catch(err => {
  console.error("❌ Erro completo:");
  if (err.response) {
    console.error(JSON.stringify(err.response.data, null, 2));
  } else {
    console.error(err.message);
  }
});