import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { HomePage } from './home.page';

const routes: Routes = [
  {
    path: '',
    component: HomePage,
    children: [
      {
        path: 'note',
        loadChildren: () =>
          import('../add-note/add-note.module').then(m => m.AddNotePageModule)
      },
      {
        path: 'note/:id',
        loadChildren: () =>
          import('../add-note/add-note.module').then(m => m.AddNotePageModule)
      },
      {
        path: '',
        redirectTo: 'note',
        pathMatch: 'full'
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HomePageRoutingModule {}
