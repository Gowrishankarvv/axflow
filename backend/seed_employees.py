#!/usr/bin/env python
"""
Seed script to create sample employees with new positions.
Run with: python manage.py shell < seed_employees.py
"""

from django.contrib.auth import get_user_model

User = get_user_model()

# Sample employee data organized by department
EMPLOYEES = [
    # Development Team
    {
        "email": "john.flutter@Axinortech.com",
        "first_name": "John",
        "last_name": "Flutter",
        "position": "Flutter Senior Dev",
        "role": "employee",
        "password": "Dev@1234",
    },
    {
        "email": "sarah.react@Axinortech.com",
        "first_name": "Sarah",
        "last_name": "React",
        "position": "React Junior Dev",
        "role": "employee",
        "password": "Dev@1234",
    },
    {
        "email": "mike.django@Axinortech.com",
        "first_name": "Mike",
        "last_name": "Django",
        "position": "Django Senior Dev",
        "role": "manager",
        "password": "Dev@1234",
    },
    {
        "email": "alex.react.intern@Axinortech.com",
        "first_name": "Alex",
        "last_name": "React",
        "position": "React Intern",
        "role": "employee",
        "password": "Dev@1234",
    },
    
    # Design Team
    {
        "email": "emma.uiux@Axinortech.com",
        "first_name": "Emma",
        "last_name": "Designer",
        "position": "UI/UX Senior Dev",
        "role": "employee",
        "password": "Dev@1234",
    },
    {
        "email": "design.intern@Axinortech.com",
        "first_name": "Design",
        "last_name": "Intern",
        "position": "Graphics Designer Intern",
        "role": "employee",
        "password": "Dev@1234",
    },
    {
        "email": "video.editor@Axinortech.com",
        "first_name": "Victor",
        "last_name": "Video",
        "position": "Video Editor Junior",
        "role": "employee",
        "password": "Dev@1234",
    },
    
    # Management & Strategy
    {
        "email": "lisa.pm@Axinortech.com",
        "first_name": "Lisa",
        "last_name": "Project Manager",
        "position": "Project Manager Senior",
        "role": "manager",
        "password": "Dev@1234",
    },
    {
        "email": "david.researcher@Axinortech.com",
        "first_name": "David",
        "last_name": "Researcher",
        "position": "Product Researcher Senior",
        "role": "employee",
        "password": "Dev@1234",
    },
    {
        "email": "james.business@Axinortech.com",
        "first_name": "James",
        "last_name": "Business",
        "position": "Business Developer Junior",
        "role": "employee",
        "password": "Dev@1234",
    },
    
    # Operations & HR
    {
        "email": "rachel.hr@Axinortech.com",
        "first_name": "Rachel",
        "last_name": "HR Manager",
        "position": "HR Senior",
        "role": "manager",
        "password": "Dev@1234",
    },
    {
        "email": "sarah.hr.intern@Axinortech.com",
        "first_name": "Sarah",
        "last_name": "HR Intern",
        "position": "HR Intern",
        "role": "employee",
        "password": "Dev@1234",
    },
    
    # Executive
    {
        "email": "ceo@Axinortech.com",
        "first_name": "Executive",
        "last_name": "CEO",
        "position": "CEO",
        "role": "superuser",
        "password": "Dev@1234",
    },
    {
        "email": "cfo@Axinortech.com",
        "first_name": "Finance",
        "last_name": "Officer",
        "position": "CFO",
        "role": "manager",
        "password": "Dev@1234",
    },
]

print("🌱 Seeding sample employees...\n")

created_count = 0
updated_count = 0

for emp_data in EMPLOYEES:
    try:
        user, created = User.objects.get_or_create(
            username=emp_data["email"],
            email=emp_data["email"],
            defaults={
                "first_name": emp_data["first_name"],
                "last_name": emp_data["last_name"],
                "position": emp_data["position"],
                "role": emp_data["role"],
                "is_active": True,
            }
        )
        
        # Set password if new user
        if created:
            user.set_password(emp_data["password"])
            user.save()
            print(f"✅ Created: {emp_data['first_name']} {emp_data['last_name']} ({emp_data['position']})")
            created_count += 1
        else:
            # Update existing user
            user.first_name = emp_data["first_name"]
            user.last_name = emp_data["last_name"]
            user.position = emp_data["position"]
            user.role = emp_data["role"]
            user.save()
            print(f"🔄 Updated: {emp_data['first_name']} {emp_data['last_name']} ({emp_data['position']})")
            updated_count += 1
            
    except Exception as e:
        print(f"❌ Error with {emp_data['email']}: {str(e)}")

print(f"\n✨ Seeding complete!")
print(f"   Created: {created_count} employees")
print(f"   Updated: {updated_count} employees")
print(f"   Total: {created_count + updated_count} employees")
