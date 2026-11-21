from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health),
    path("items/", views.items),
    path("items/new/", views.create_item),
]
