import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Baza API jest konfigurowalna bez zmiany kodu:
//   ./gradlew assembleRelease -Pplanzajec.apiBase=http://192.168.1.10:3000
// Fork „ideis” domyślnie rozmawia z serwerem ideis.mati-it.pl, który zna
// nabór (parametr `ay`) i pełny katalog uczelni.
val apiBase: String = (project.findProperty("planzajec.apiBase") as String?)
    ?: "https://ideis.mati-it.pl"

// Numer wersji trzymamy w android/version.properties, bo podbija go skrypt
// publikacji (scripts/publish-apk.ps1) — bez edycji plików Gradle.
val versionPropertiesFile = rootProject.file("version.properties")
val versionProperties = Properties().apply {
    if (versionPropertiesFile.exists()) versionPropertiesFile.inputStream().use { load(it) }
}
val appVersionCode: Int = (project.findProperty("planzajec.versionCode") as String?)?.toIntOrNull()
    ?: versionProperties.getProperty("versionCode")?.toIntOrNull()
    ?: 1
val appVersionName: String = (project.findProperty("planzajec.versionName") as String?)
    ?: versionProperties.getProperty("versionName")
    ?: "1.0"

// Podpis wydania: jeśli obok projektu leży keystore.properties, użyj własnego
// klucza. W przeciwnym razie wydanie podpisujemy kluczem debug, żeby APK dało
// się zainstalować na telefonie bez zakładania sklepu (patrz README).
val keystorePropertiesFile = rootProject.file("keystore.properties")
val hasReleaseKeystore = keystorePropertiesFile.exists()
val keystoreProperties = Properties().apply {
    if (hasReleaseKeystore) keystorePropertiesFile.inputStream().use { load(it) }
}

android {
    namespace = "pl.matiit.planzajec"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        // Osobny identyfikator: fork instaluje się obok aplikacji z
        // plany.mati-it.pl i ma własny kanał aktualizacji (manifest
        // `latest.json` z tym samym `app`).
        applicationId = "pl.matiit.planzajec.ideis"
        // Android 8.0: Compose i java.time są w pełni dostępne od API 26.
        minSdk = 26
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersionName

        buildConfigField("String", "API_BASE", "\"$apiBase\"")
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}")
    }

    androidResources {
        localeFilters += listOf("pl")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.glance.material3)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.kotlinx.serialization.json)

    debugImplementation(libs.androidx.compose.ui.tooling)

    testImplementation(libs.junit)
}
