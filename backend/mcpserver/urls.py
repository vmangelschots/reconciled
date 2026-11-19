from django.urls import path

from . import views

urlpatterns = [
    path("mcp-tokens/", views.TokensView.as_view(), name="mcp-tokens"),
    path("mcp-tokens/<int:pk>/", views.TokenView.as_view(), name="mcp-token"),
]
