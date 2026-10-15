from rest_framework import mixins, viewsets

from .models import Category
from .serializers import CategorySerializer


class CategoryViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Read-only for now, so the transaction category picker has
    something to list. Task 4.1 is expected to extend this with
    create/rename and the delete-requires-reassignment rule from the
    budgets spec.
    """

    queryset = Category.objects.all()
    serializer_class = CategorySerializer
