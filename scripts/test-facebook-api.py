import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('161.97.160.76', username='root', password='Ma182404To', timeout=20)

cmd = """python3 -c '
import urllib.request, json

# 1. Login
login_data = json.dumps({"email": "admin@nexora.io", "password": "Admin1234!"}).encode("utf-8")
req = urllib.request.Request("http://127.0.0.1:3107/api/login", data=login_data, headers={"Content-Type": "application/json", "X-Nexora-Request": "1"})
res = urllib.request.urlopen(req)
token = res.headers.get("Set-Cookie").split(";")[0]

auth_headers = {"X-Nexora-Request": "1", "Cookie": token, "Content-Type": "application/json"}

# 2. Test Navidad copy
copy_data = json.dumps({
    "title": "Luces Navideñas LED Solares (10 Metros / Calidez Mágica)",
    "price": 14990,
    "description": "8 modos de parpadeo automático. Carga durante el día con su panel solar de alta eficiencia y se enciende sola al anochecer. Totalmente resistente al agua y lluvia.",
    "whatsapp": "+56928148946",
    "store_url": "https://nexora.wentixai.cyou/tienda",
    "niche": "navidad",
    "style": "direct"
}).encode("utf-8")

req_copy = urllib.request.Request("http://127.0.0.1:3107/api/facebook/generate-copy", data=copy_data, headers=auth_headers)
res_copy = urllib.request.urlopen(req_copy)
print("=== COPIA GENERADA NAVIDAD (DIRECTA) ===")
print(json.loads(res_copy.read().decode())["copy"])
'"""

stdin, stdout, stderr = client.exec_command(cmd)
print(stdout.read().decode('utf-8'))
client.close()
