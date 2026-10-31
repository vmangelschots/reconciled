from django.urls import path

from . import views

urlpatterns = [
    path("bank-sync/", views.StatusView.as_view()),
    path("bank-sync/banks/", views.BanksView.as_view()),
    path("bank-sync/authorize/", views.AuthorizeView.as_view()),
    path("bank-sync/complete/", views.CompleteView.as_view()),
    path("bank-sync/run/", views.RunView.as_view()),
    path("bank-sync/connections/<int:pk>/", views.ConnectionView.as_view()),
    path("bank-sync/links/", views.LinksView.as_view()),
    path("bank-sync/links/<int:pk>/", views.LinkView.as_view()),
]
