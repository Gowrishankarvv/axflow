from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

class Command(BaseCommand):
    help = 'Create a superuser with specified credentials'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True, help='Email for the superuser')
        parser.add_argument('--password', required=True, help='Password for the superuser')

    def handle(self, *args, **options):
        email = options['email']
        password = options['password']
        username = email
        role = 'superuser'

        if User.objects.filter(username=username).exists():
            self.stdout.write(self.style.WARNING(f'Superuser {username} already exists'))
            return

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            role=role,
            is_superuser=True,
            is_staff=True
        )
        self.stdout.write(self.style.SUCCESS(f'Superuser {username} created successfully'))
