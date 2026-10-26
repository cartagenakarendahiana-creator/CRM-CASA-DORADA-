#!/bin/bash
# Se corre UNA SOLA VEZ en Cloud Shell. Le da permiso a GitHub (solo a este repositorio) para publicar
# House Chat en Firebase, sin guardar claves: GitHub demuestra quién es y Google le presta la cuenta github-deploy.
set -e
P=crm-casa-dorada
REPO=cartagenakarendahiana-creator/CRM-CASA-DORADA-
SA=github-deploy@$P.iam.gserviceaccount.com
gcloud config set project $P >/dev/null
N=$(gcloud projects describe $P --format='value(projectNumber)')
echo "1/5 Activando servicios…"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com storage.googleapis.com >/dev/null
echo "2/5 Cuenta de publicación…"
gcloud iam service-accounts describe $SA >/dev/null 2>&1 || gcloud iam service-accounts create github-deploy --display-name="Publicación desde GitHub" >/dev/null
echo "3/5 Permisos…"
for R in roles/editor roles/firebase.admin roles/cloudfunctions.admin roles/run.admin roles/iam.serviceAccountUser roles/secretmanager.admin roles/storage.admin roles/cloudscheduler.admin; do
  gcloud projects add-iam-policy-binding $P --member=serviceAccount:$SA --role=$R --condition=None >/dev/null
done
echo "4/5 Conexión con GitHub…"
gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create github --location=global --display-name=GitHub >/dev/null
gcloud iam workload-identity-pools providers describe github --location=global --workload-identity-pool=github >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github --display-name=GitHub \
       --issuer-uri=https://token.actions.githubusercontent.com \
       --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
       --attribute-condition="assertion.repository=='$REPO'" >/dev/null
echo "5/5 Autorizando el repositorio $REPO…"
gcloud iam service-accounts add-iam-policy-binding $SA --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$N/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" >/dev/null
echo
if [ "$N" = "370958688712" ]; then echo "✅ Listo. Desde ahora, cada cambio en main se publica solo."
else echo "⚠️ Listo, pero el número del proyecto es $N (se esperaba 370958688712). Avísale a Claude para ajustar la publicación."; fi
