const crypto = require('crypto');

const PUBLIC_KEY = "pk_0zE98vjAJ0_-2am1aa06NU4WaRVND405Y3ZDTpKbPdpYwXv_";
const SECRET_KEY = "sk_HwrBVQO1MezVbJfaqdImeEmMCiCNRk37UJgVee_0LIHQSWph";
const PIXEL_ID = "3059682304380413";
const ACCESS_TOKEN = "EAFeZAMItwIDMBRRwmKcrSA5pOkqlRH9L9Ic0SCzRbpiwX9BPdAjkhDxq4tn2v1zbD9vDdVSZBXiZBqbNK3x57vdzu60HUppISm4uFnwsA6KwYXs3Me6oxr8nxg5MVtyZBUMcTsWTTFQ9Nv0twR7h0x0H3STCSoaxwl9VyZAZBb9kDAou8wUKn95i8RpZANIgwZDZD";

let stats = { visits: 0, checkouts: 0, sales: 0, revenue: 0, orders: [] };

function hashData(data) {
    if (!data) return "";
    return crypto.createHash('sha256').update(data.trim().toLowerCase()).digest('hex');
}

async function sendMetaPurchase(order) {
    try {
        const url = `https://graph.facebook.com/v17.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;
        const payload = {
            data: [{
                event_name: "Purchase",
                event_time: Math.floor(Date.now() / 1000),
                action_source: "website",
                user_data: { em: [hashData(order.email)], ph: [hashData(order.customer_phone)] },
                custom_data: { value: parseFloat(order.amount), currency: "BRL", content_name: order.product }
            }]
        };
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (e) {}
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action } = req.query;
    
    // Tenta ler o corpo da requisição de várias formas para não dar erro 500
    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    if (!body) body = {};

    try {
        if (action === 'trackVisit') {
            stats.visits++;
            return res.status(200).json({ status: 'ok' });
        }

        if (action === 'trackCheckout') {
            stats.checkouts++;
            return res.status(200).json({ status: 'ok' });
        }

        if (action === 'gerarPix') {
            const { nome, email, phone, document, valor, kitName, address } = body;

            // Se faltar dados básicos, avisa o usuário em vez de travar
            if (!nome || !email || !valor) {
                return res.status(400).json({ error: 'Dados incompletos no checkout.' });
            }

            const valorFinal = Math.round(parseFloat(valor));
            const cleanCpf = (document || "").replace(/\D/g, '');
            let cleanPhone = (phone || "").replace(/\D/g, '');
            if (cleanPhone.length > 11) cleanPhone = cleanPhone.slice(-11);

            const auth = Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString('base64');
            const externalRef = `panini_${Date.now()}`;

            const streetPayload = {
                amount: valorFinal,
                paymentMethod: "pix",
                externalRef: externalRef,
                customer: {
                    name: (nome || "Cliente").trim(),
                    email: (email || "email@teste.com").trim().toLowerCase(),
                    phone: cleanPhone || "11999999999",
                    document: { number: cleanCpf || "00000000000", type: "cpf" }
                },
                items: [{ title: `Panini - ${kitName || "Kit"}`, unitPrice: valorFinal, quantity: 1, tangible: true }],
                pix: { expiresInDays: 1 }
            };

            const response = await fetch('https://api.streetpayments.com.br/v1/sales', {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(streetPayload)
            });

            const data = await response.json();

            if (response.ok && data.id) {
                const newOrder = {
                    id: data.id,
                    externalRef: externalRef,
                    date: new Date().toLocaleString('pt-BR'),
                    nome, email, customer_phone: cleanPhone,
                    product: kitName, amount: (valorFinal / 100).toFixed(2),
                    address, status: 'Aguardando PIX'
                };
                stats.orders.unshift(newOrder);
                return res.status(200).json({ status: 'success', id: data.id, pix_copia_e_cola: data.pix.qrcode });
            } else {
                return res.status(400).json({ error: data.message || 'Erro na StreetPay' });
            }
        }

        if (action === 'adminData') {
            if (body.password !== 'criss123') return res.status(401).json({ error: 'Senha incorreta' });
            return res.status(200).json(stats);
        }

        return res.status(404).json({ error: 'Ação não encontrada' });

    } catch (error) {
        return res.status(200).json({ status: 'error', error: error.message }); // Retorna 200 para evitar o erro de JSON no navegador
    }
};
