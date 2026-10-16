from rest_framework import serializers

from .models import Category


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "parent", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def validate_parent(self, parent):
        if parent is None:
            return parent
        if self.instance is not None and parent.id == self.instance.id:
            raise serializers.ValidationError("A category cannot be its own parent.")
        if parent.parent_id is not None:
            raise serializers.ValidationError(
                "A subcategory cannot itself be used as a parent (two levels max)."
            )
        return parent

    def validate(self, attrs):
        # DRF auto-generates a UniqueValidator from a field-level
        # unique=True, but name's uniqueness is now two conditional
        # Meta.constraints (per-level), which DRF does not introspect -
        # without this, a duplicate name hits the database's
        # IntegrityError directly and surfaces as a raw 500.
        name = attrs["name"] if "name" in attrs else getattr(self.instance, "name", None)
        parent = attrs["parent"] if "parent" in attrs else getattr(self.instance, "parent", None)
        if name is not None:
            clash = Category.objects.filter(name=name, parent=parent)
            if self.instance is not None:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError(
                    {"name": "A category with this name already exists at this level."}
                )
        return attrs
