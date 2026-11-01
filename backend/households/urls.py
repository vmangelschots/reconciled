from django.urls import path

from . import views

urlpatterns = [
    path("household/", views.HouseholdView.as_view(), name="household"),
    path("household/ai/", views.AiView.as_view(), name="household-ai"),
    path("household/switch/", views.SwitchView.as_view(), name="household-switch"),
    path("household/leave/", views.LeaveView.as_view(), name="household-leave"),
    path("household/invites/", views.InvitesView.as_view(), name="household-invites"),
    path("household/invites/<int:pk>/", views.InviteView.as_view(), name="household-invite"),
    path("auth/password/", views.PasswordView.as_view(), name="auth-password"),
    path("invites/<str:token>/", views.PublicInviteView.as_view(), name="public-invite"),
    path("invites/<str:token>/accept/", views.AcceptInviteView.as_view(), name="public-invite-accept"),
]
