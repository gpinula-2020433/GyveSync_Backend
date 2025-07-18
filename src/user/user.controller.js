'use strict'

import Comment from '../comment/comment.model.js'
import Institution from '../institution/institution.model.js'
import Publication from '../publication/publication.model.js'
import User from '../user/user.model.js'
import { unlink } from 'fs/promises'
import path from 'path'
import { encrypt, checkPassword, checkUpdate } from '../../utils/encrypt.js'
import Notification from '../notification/notification.model.js'

//Default admin
export const defaultAdmin = async (nameA, surnameA, usernameA, emailA, passwordA, roleA) => {
    try {
        let adminFound = await User.findOne({ role: 'ADMIN' })
        let usernameExists = await User.findOne({ username: usernameA })
        let emailExists = await User.findOne({ email: emailA })

        if (adminFound) {
            return console.log('El administrador predeterminado ya existe.')
        }

        if (usernameExists || emailExists) {
            return console.log('No se puede crear el administrador predeterminado: el nombre de usuario o el correo electrónico ya existen.')
        }

        const data = {
            name: nameA,
            surname: surnameA,
            username: usernameA,
            email: emailA,
            password: await encrypt(passwordA),
            role: roleA
        }

        let user = new User(data)
        await user.save()
        console.log('Se ha creado un administrador predeterminado.')
    } catch (err) {
        console.error('Error al crear el administrador predeterminado:', err)
    }
}

// ------------------------- Client -------------------
export const getAuthenticatedClient = async(req, res)=>{
    try {
        const id = req.user.uid
        const user = await User.findById(id)
        if(!user){
            return res.status(404).send({
                success: false,
                message: 'Usuario no encontrado'
            })
        }
        return res.send({
            success: true,
            message: 'Usuario encontrado',
            user
        })
    } catch (error) {
        console.error(error)
        return res.status(500).send({message: 'Error al actualizar el usuario'})
    }
}

export const updateClient = async (req, res) => {
  try {
      const { uid } = req.user
      const data = req.body

      console.log('ID del usuario autenticado:', uid)

      const user = await User.findById(uid)
      if (!user) {
          return res.status(404).send({
              message: 'Usuario no encontrado.'
          })
      }

      const update = checkUpdate(data, uid)
      if (!update) {
          return res.status(400).send({
              message: 'Datos inválidos o faltantes para la actualización.'
          })
      }

      const updatedUser = await User.findByIdAndUpdate(
          uid,
          data,
          { new: true }
      )

      const io = req.app.get('io');
      io.emit('updateUser', updatedUser);

      return res.status(200).send({
          message: 'Usuario actualizado con éxito.',
          user: updatedUser.toJSON()
      })

  } catch (err) {
      console.error(err)
      return res.status(500).send({
          message: 'Error al actualizar el usuario.'
      })
  }
}

export const updatePassword = async(req, res)=>{
    try {
        let {uid} = req.user
        const { currentPassword, newPassword} = req.body

        if(!currentPassword || ! newPassword)
            return res.status(400).send({message: 'Faltan la contraseña actual o la nueva contraseña'})

        const user = await User.findById(uid)
        if(!user) return res.status(400).send({message: 'Usuario no encontrado'})

        const validPassword = await checkPassword(user.password, currentPassword)
        if(!validPassword) return res.status(400).send({message: 'Contraseña incorrecta'})

        if(newPassword.length < 8 || newPassword.length > 100){
            return res.status(400).send({message: 'La contraseña debe tener entre 8 y 100 caracteres'})
        }

        user.password = await encrypt(newPassword)
        await user.save()

        return res.status(200).send({message: '¡Contraseña actualizada con éxito!'})
    } catch (error) {
        console.error(err)
        return res.status(500).send({message: 'Error al actualizar la contraseña'})
    }
}


export const deleteClient = async (req, res) => {
  try {
    const { uid } = req.user
    const { password } = req.body

    const user = await User.findById(uid)

    if (!user) {
      return res.status(404).send({ message: 'Usuario no encontrado' })
    }

    if (user.username === '1pinula') {
      return res.status(401).send({ message: 'No se puede eliminar al administrador por defecto' })
    }

    if (user.role === 'ADMIN') {
      return res.status(401).send({ message: 'No puedes eliminar un administrador.' })
    }

    const check = await checkPassword(user.password, password)
    if (!check) {
      return res.status(401).send({ message: 'Contraseña incorrecta' })
    }

    await Comment.deleteMany({ userId: uid })

    const institutions = await Institution.find({ userId: uid })

    for (const institution of institutions) {
      const publications = await Publication.find({ institutionId: institution._id })

      for (const pub of publications) {
        await Comment.deleteMany({ publicationId: pub._id })
      }

      await Publication.deleteMany({ institutionId: institution._id })
    }

    await Institution.deleteMany({ userId: uid })

    if (user.imageUser) {
      const imagePath = path.join(process.cwd(), 'uploads/img/users', user.imageUser)
      try {
        await unlink(imagePath)
      } catch (err) {
        console.warn(`Error al eliminar la imagen del usuario: ${err.message}`)
      }
    }

    await Notification.deleteMany({
      $or: [
        { userId: uid },
        { fromUserId: uid }
      ]
    })

    const deletedUser = await User.findByIdAndDelete(uid)

    const io = req.app.get('io');
    io.emit('deleteUser', deletedUser._id);

    return res.send({
      message: `La cuenta ${deletedUser.name} ${deletedUser.surname} se eliminó con éxito`
    })
  } catch (err) {
    console.error('Error al eliminar cuenta:', err)
    return res.status(500).send({ message: err.message || 'Error al eliminar la cuenta' })
  }
}


export const updateUserProfileImageClient = async (req, res) => {
  try {
    const id = req.user.uid

    if (!req.file) {
      return res.status(400).send({
        success: false,
        message: 'No se proporcionó un archivo de imagen'
      })
    }
    
    const { filename } = req.file

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).send(
            {
                success: false,
                message: 'Usuario no encontrado - no se actualizó'
            }
        )
    }

    if (user.imageUser) {
      const imagePath = path.join(process.cwd(), 'uploads/img/users', user.imageUser)
      try {
        await unlink(imagePath)
      } catch (err) {
        console.warn('Error al eliminar la imagen antigua del usuario:', err.message)
      }
    }

    user.imageUser = filename
    await user.save()

    const io = req.app.get('io');
    io.emit('updateUserImage', user);

    return res.send({
      success: true,
      message: 'La imagen del usuario se actualizó con éxito',
      user
    })
  } catch (err) {
    console.error('Error general', err)
    return res.status(500).send({
      success: false,
      message: 'Error general',
      err
    })
  }
}

export const deleteUserProfileImageClient = async (req, res) => {
  try {
    const id = req.user.uid

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).send({
        success: false,
        message: 'Usuario no encontrado'
      })
    }

    if (!user.imageUser) {
      return res.status(400).send({
        success: false,
        message: 'El usuario no tiene una imagen de perfil'
      })
    }

    const imagePath = path.join(process.cwd(), 'uploads/img/users', user.imageUser)

    try {
      await unlink(imagePath)
    } catch (err) {
      console.warn('Error al eliminar el archivo de imagen:', err.message)
      return res.status(500).send({
        success: false,
        message: 'Error al eliminar el archivo de imagen',
        error: err.message
      })
    }

    user.imageUser = null
    await user.save()

    const io = req.app.get('io');
    io.emit('updateUserImage', user);

    return res.send({
      success: true,
      message: 'La imagen de perfil se eliminó con éxito',
      user
    })

  } catch (err) {
    console.error('Error general:', err)
    return res.status(500).send({
      success: false,
      message: 'Error general',
      error: err.message
    })
  }
}

//------------------------------------Administrador -----------------------------------
export const changeRole = async (req, res) => {
  try {
    const { id } = req.params
    const { role } = req.body

    if (!role) {
      return res.status(400).send({ message: 'Falta el rol para cambiar' })
    }

    if (!['ADMIN', 'CLIENT'].includes(role.toUpperCase())) {
      return res.status(400).send({ message: 'Rol no válido. Solo se permite ADMIN o CLIENT.' })
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { role: role.toUpperCase() },
      { new: true }
    )

    if (!updatedUser) {
      return res.status(404).send({ message: 'Usuario no encontrado' })
    }

    return res.status(200).send({
      message: 'El rol se ha cambiado correctamente.',
      user: updatedUser
    })
  } catch (err) {
    console.error(err)
    return res.status(500).send({ message: err.message || 'Error al cambiar el rol' })
  }
}

export const getUserById = async(req, res)=>{
    try {
        const { id } = req.params
        const user = await User.findById(id)
        if(!user){
            return res.status(404).send({
                success: false,
                message: 'Usuario no encontrado'
            })
        }
        return res.send({
            success: true,
            message: 'Usuario encontrado',
            user
        })
    } catch (error) {
        console.error(error)
        return res.status(500).send({message: 'Error al actualizar el usuario'})
    }
}

export const getAllUsers = async (req, res) => {
    const { limit, skip } = req.query
    
    try {
        const users = await User.find()
            .skip(skip)
            .limit(limit)

        if (users.length === 0) {
            return res.status(404).send({
                success: false,
                message: 'No se encontraron usuarios'
            })
        }

        return res.send({
            success: true,
            message: 'Usuarios obtenidos con éxito',
            total: users.length,
            data: users
        });
    } catch (err) {
        console.error('Error al obtener usuarios:', err);
        return res.status(500).send({
            success: false,
            message: 'Error interno del servidor',
            error: err.message
        })
    }
}

export const updateUser = async (req, res) => {
    try {
        let { _id } = req.user
        let { id } = req.params
        let data = req.body

        let user = await User.findOne({ _id: id })

        if ((user.role === 'ADMIN') && (_id != id)) {
            return res.status(403).send({
                message: 'No puedes actualizar a un administrador, solo puedes actualizar clientes.'
            })
        }

        let update = checkUpdate(data, id)
        if (!update) return res.status(400).send({ message: 'No se pueden actualizar los datos o faltan datos' })

        let updatedUser = await User.findByIdAndUpdate(
            id,
            data,
            { new: true }
        )

        if (!updatedUser) return res.status(404).send({ message: 'Usuario no encontrado' })

        return res.status(200).send({
            message: 'Usuario actualizado con éxito.',
            user: updatedUser
        })

    } catch (err) {
        console.error(err)
        return res.status(500).send({ message: 'Error al actualizar el usuario' })
    }
}

export const updateUserProfileImage = async (req, res) => {
  try {
    const { id } = req.params
    const idUserUpdating = req.user.uid

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).send(
            {
                success: false,
                message: 'Usuario no encontrado - no se actualizó'
            }
        )
    }
    
    const userToUpdate = await User.findById(id)
    if(userToUpdate.role === 'ADMIN' && idUserUpdating !== id){
      return res.send(
        {
          success: false,
          message: 'No puedes actualizar la foto de perfil de otro administrador que no seas tu'
        }
      )
    }

    if (!req.file) {
      return res.status(400).send({
        success: false,
        message: 'No se proporcionó un archivo de imagen'
      })
    }
    
    const { filename } = req.file

    if (user.imageUser) {
      const imagePath = path.join(process.cwd(), 'uploads/img/users', user.imageUser)
      try {
        await unlink(imagePath)
      } catch (err) {
        console.warn('Error al eliminar la imagen antigua del usuario:', err.message)
      }
    }

    user.imageUser = filename
    await user.save()

    return res.send({
      success: true,
      message: 'La imagen del usuario se actualizó con éxito',
      user
    })
  } catch (err) {
    console.error('Error general', err)
    return res.status(500).send({
      success: false,
      message: 'Error general',
      err
    })
  }
}

export const deleteUserProfileImage = async (req, res) => {
  try {
    const { id } = req.params

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).send({
        success: false,
        message: 'Usuario no encontrado'
      })
    }

    const idUserUpdating = req.user.uid
    const userToUpdate = await User.findById(id)
    if(userToUpdate.role === 'ADMIN' && idUserUpdating !== id){
      return res.send(
        {
          success: false,
          message: 'No puedes eliminar la foto de perfil de otro administrador que no seas tu'
        }
      )
    }

    if (!user.imageUser) {
      return res.status(400).send({
        success: false,
        message: 'El usuario no tiene una imagen de perfil'
      })
    }

    const imagePath = path.join(process.cwd(), 'uploads/img/users', user.imageUser)

    try {
      await unlink(imagePath)
    } catch (err) {
      console.warn('Error al eliminar el archivo de imagen:', err.message)
      return res.status(500).send({
        success: false,
        message: 'Error al eliminar el archivo de imagen',
        error: err.message
      })
    }

    user.imageUser = null
    await user.save()

    return res.send({
      success: true,
      message: 'La imagen de perfil del usuario se eliminó con éxito',
      user
    })

  } catch (err) {
    console.error('Error general:', err)
    return res.status(500).send({
      success: false,
      message: 'Error general',
      error: err.message
    })
  }
}

export const deleteUserAdmin = async (req, res) => {
  try {
    const idUsuarioAdmin = req.user.uid
    const { idUsuarioAEliminar, password } = req.body

    const adminUser = await User.findById(idUsuarioAdmin)
    if (!adminUser || adminUser.role !== 'ADMIN') {
      return res.status(403).send({ message: 'No autorizado. Solo administradores pueden realizar esta acción.' })
    }

    const user = await User.findById(idUsuarioAEliminar)

    if (!user) {
      return res.status(404).send({ message: 'Usuario no encontrado' })
    }

    const isPasswordValid = await checkPassword(adminUser.password, password)
    if (!isPasswordValid) {
      return res.status(401).send({ message: 'Tu contraseña es incorrecta, no se puede proceder' })
    }

    if (user.username === '1pinula') {
      return res.status(403).send({ message: 'No puedes eliminar al administrador predeterminado' })
    }

    if (user.role === 'ADMIN' && idUsuarioAdmin !== user._id.toString()) {
      return res.status(403).send({ message: 'No puedes eliminar a un administrador, solo puedes eliminar clientes.' })
    }

    await Comment.deleteMany({ userId: user._id })

    const institutions = await Institution.find({ userId: user._id })

    for (const institution of institutions) {
      const publications = await Publication.find({ institutionId: institution._id })

      for (const pub of publications) {
        await Comment.deleteMany({ publicationId: pub._id })
      }

      await Publication.deleteMany({ institutionId: institution._id })
    }

    await Institution.deleteMany({ userId: user._id })

    if (user.imageUser) {
      const imagePath = path.join(process.cwd(), 'uploads/img/users', user.imageUser)
      try {
        await unlink(imagePath)
      } catch (err) {
        console.warn(`Error al eliminar la imagen del usuario: ${err.message}`)
      }
    }

    await Notification.deleteMany({
      $or: [
        { userId: user._id },
        { fromUserId: user._id }
      ]
    })

    const deletedUser = await User.findByIdAndDelete(user._id)

    const io = req.app.get('io')
    io.emit('deleteUser', deletedUser._id)

    return res.send({
      message: `La cuenta ${deletedUser.name} ${deletedUser.surname} se eliminó con éxito`
    })

  } catch (err) {
    console.error('Error al eliminar usuario (admin):', err)
    return res.status(500).send({ message: 'Error al eliminar la cuenta' })
  }
}

