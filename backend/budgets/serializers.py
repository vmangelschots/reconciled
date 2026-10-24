from rest_framework import serializers

from .models import Category


class CategorySerializer(serializers.ModelSerializer):
    is_tab = serializers.SerializerMethodField()
    # Rows assigned directly to this category, so the settings know when
    # changing a group's kind moves money in or out of the reports.
    transaction_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "parent",
            "is_tab_group",
            "is_tab",
            "transaction_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_is_tab(self, category):
        return category.is_tab

    def get_transaction_count(self, category):
        count = getattr(category, "transaction_count", None)
        return category.transactions.count() if count is None else count

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
        self._validate_tab_group(attrs, parent)
        return attrs

    def _validate_tab_group(self, attrs, parent):
        is_tab_group = attrs.get("is_tab_group", getattr(self.instance, "is_tab_group", False))
        if not is_tab_group:
            return
        if parent is not None:
            raise serializers.ValidationError(
                {"is_tab_group": "Only a top-level category can be a tab group."}
            )
        if self.instance is not None and not self.instance.is_tab_group:
            count = self.instance.transactions.count()
            if count:
                raise serializers.ValidationError(
                    {
                        "is_tab_group": (
                            f"{count} transaction(s) are assigned to this category itself. "
                            "Reassign them before making it a tab group."
                        )
                    }
                )
