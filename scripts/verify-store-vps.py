import paramiko
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('161.97.160.76', username='root', password='Ma182404To', timeout=15)

def check(cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='replace')

print('=== 1. NEXORA SERVICE STATUS ===')
status = check('systemctl is-active nexora.service').strip()
print('Status:', status)

print('\n=== 2. LOCAL API HEALTH (PORT 3107) ===')
health = check('curl -s http://127.0.0.1:3107/api/health')
print('Health:', health)

print('\n=== 3. PUBLIC API HEALTH (HTTPS) ===')
public_health = check('curl -s https://nexora.wentixai.cyou/api/health')
print('Public Health:', public_health)

print('\n=== 4. STORE PRODUCTS ENDPOINT (DX Tools) ===')
raw_products = check('curl -s "http://127.0.0.1:3107/api/store/products?onlyTools=true&limit=3"')
data = json.loads(raw_products)
print(f"Total DX Tools available: {data.get('total')}")
print(f"Retrieved in sample: {len(data.get('products', []))}")
for p in data.get('products', []):
    print(f" - [{p['sku']}] {p['name']} | Precio: ${p['price']} | Costo: ${p['wholesale_cost']} | Stock: {p['stock']}")

print('\n=== 5. TEST PUBLIC ORDER CREATION (POST /api/store/orders) ===')
first_item = data['products'][0]
order_payload = {
    "customer_name": "Manuel Valdés (Prueba DX)",
    "customer_phone": "+56930825227",
    "customer_address": "Av. Las Industrias 1020",
    "customer_commune": "Quilicura",
    "customer_city": "Santiago",
    "payment_method": "Contraentrega / Transferencia",
    "notes": "Prueba automática de pedido DX Storefront",
    "items": [
        { "sku": first_item['sku'], "variant_id": first_item['id'], "qty": 1 }
    ]
}

# Run curl with proper escaping
node_test_order = f"""
const res = await fetch('http://127.0.0.1:3107/api/store/orders', {{
  method: 'POST',
  headers: {{ 'Content-Type': 'application/json' }},
  body: JSON.stringify({json.dumps(order_payload)})
}});
const result = await res.json();
console.log('Order Result:', JSON.stringify(result, null, 2));
"""
order_res = check(f"node --input-type=module -e {repr(node_test_order)}")
print(order_res)

print('\n=== 6. PUBLIC STOREFRONT WEB ASSETS ===')
dist_check = check('ls -la /opt/nexora/dist/assets')
print(dist_check)

client.close()
print('\n=== VERIFICATION COMPLETE ===')
