from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework import serializers

from tables import OrganizationUnit, User


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "position",
            "role",
            "manager",
            "monthly_threshold_hours",
            "must_set_password",
            "is_active",
            "password",
            "client_org",
        ]
        read_only_fields = ["must_set_password"]

    def validate_email(self, value):
        try:
            instance = self.instance or User(email=value)
            instance.email = value
            instance.clean()
        except Exception as exc:
            raise serializers.ValidationError(str(exc))
        return value

    def create(self, validated_data):
        password = validated_data.pop("password", "")
        email = validated_data.get("email")
        username = validated_data.get("username") or email
        validated_data["username"] = username
        user = User(**validated_data)
        if password:
            try:
                validate_password(password, user)
            except ValidationError as e:
                raise serializers.ValidationError({"password": e.messages})
            user.set_password(password)
            user.must_set_password = False
        else:
            user.set_password("12345678")
            user.must_set_password = True
        user.save()
        if user.manager_id:
            try:
                mgr = User.objects.get(id=user.manager_id)
                if mgr.role not in ("superuser", "manager"):
                    mgr.role = "manager"
                    mgr.save(update_fields=["role"])
            except User.DoesNotExist:
                pass
        return user

    def update(self, instance: User, validated_data):
        previous_manager_id = instance.manager_id
        instance = super().update(instance, validated_data)

        if "manager" in validated_data:
            if instance.manager_id:
                try:
                    new_mgr = User.objects.get(id=instance.manager_id)
                    if new_mgr.role not in ("superuser", "manager"):
                        new_mgr.role = "manager"
                        new_mgr.save(update_fields=["role"])
                except User.DoesNotExist:
                    pass

            if previous_manager_id and previous_manager_id != instance.manager_id:
                try:
                    prev_mgr = User.objects.get(id=previous_manager_id)
                    if prev_mgr.role != "superuser" and not prev_mgr.direct_reports.exists():
                        prev_mgr.role = "employee"
                        prev_mgr.save(update_fields=["role"])
                except User.DoesNotExist:
                    pass

        return instance


class SetPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        user: User = self.context["request"].user
        try:
            validate_password(value, user)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value

    def save(self, **kwargs):
        user: User = self.context["request"].user
        validated_data = self.validated_data
        password = validated_data.get("password")  # type: ignore
        if not password:
            raise serializers.ValidationError({"password": "Password is required."})
        user.set_password(password)
        user.must_set_password = False
        user.save(update_fields=["password", "must_set_password"])
        return user


class OrganizationUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationUnit
        fields = ["id", "name", "parent"]
