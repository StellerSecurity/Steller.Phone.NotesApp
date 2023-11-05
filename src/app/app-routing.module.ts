import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { WelcomeComponent } from './welcome/welcome.component';

const routes: Routes = [
  {
    path: 'welcome',
    component: WelcomeComponent,
  },
  {
    path: 'home',
    loadChildren: () =>
      import('./home/home.module').then((m) => m.HomePageModule),
  },
  {
    path: '',
    redirectTo: 'welcome',
    pathMatch: 'full',
  },
  {
    path: 'note',
    loadChildren: () =>
      import('./add-note/add-note.module').then((m) => m.AddNotePageModule),
  },
  {
    path: 'note/:id',
    loadChildren: () =>
      import('./add-note/add-note.module').then((m) => m.AddNotePageModule),
  },
  {
    path: 'settings-note/:id',
    loadChildren: () =>
      import('./settings-note/settings-note.module').then(
        (m) => m.SettingsNotePageModule
      ),
  },
  {
    path: 'app-settings',
    loadChildren: () =>
      import('./app-settings/app-settings.module').then(
        (m) => m.AppSettingsPageModule
      ),
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
