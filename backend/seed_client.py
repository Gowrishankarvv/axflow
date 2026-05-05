from django.contrib.auth import get_user_model
from core.models import Client, Project

User = get_user_model()

# Create Client Org
client, created = Client.objects.get_or_create(
    name="Acme Corp",
    defaults={
        "contact_email": "contact@acme.com",
        "domain": "acme.com"
    }
)
print(f"Client Org: {client.name} (Created: {created})")

# Create Client User
try:
    user = User.objects.get(email="bob@acme.com")
    print("User bob@acme.com already exists. Updating...")
    user.role = 'client'
    user.client_org = client
    user.set_password("Client@123")
    user.save()
    print("User updated.")
except User.DoesNotExist:
    user = User.objects.create_user(
        username="bob@acme.com",
        email="bob@acme.com",
        password="Client@123",
        role='client',
        client_org=client,
        first_name="Bob",
        last_name="Client"
    )
    print("User bob@acme.com created.")

# Ensure Project for Client
project, p_created = Project.objects.get_or_create(
    name="Acme Web Portal",
    defaults={
        "description": "Client requested project",
        "client": client,
        "created_by": user # temporarily set to client user or stays None
    }
)
if p_created:
    print(f"Project 'Acme Web Portal' created.")
else:
    print(f"Project 'Acme Web Portal' exists.")
