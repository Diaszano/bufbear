package examplev1

type BookServiceServer interface {
  CreateBook(context.Context, *CreateBookRequest) (*CreateBookResponse, error)
  mustEmbedUnimplementedBookServiceServer()
}
