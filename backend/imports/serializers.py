from rest_framework import serializers

from .models import ImportSession


class ImportSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportSession
        fields = ["id", "account", "file_format", "preset", "status", "candidates", "created_at", "updated_at"]
        read_only_fields = fields
